import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { costEur, DEFAULT_FORM_MAP, type Attributes } from "@thrift/shared";
import { createApp, type AnthropicLike } from "../src/app";
import { ConfigError, loadConfig } from "../src/config";
import { FileUsageStore, MemoryUsageStore } from "../src/usage";

const TOKENS = ["a".repeat(48), "b".repeat(48)];
const NOW = new Date(2026, 9, 9);

const attrs: Attributes = {
  itemType: "Strickpullover",
  categoryPath: ["Damen", "Pullover"],
  brand: "COS",
  brandEvidence: "label",
  size: "M",
  sizeEvidence: "label",
  colors: ["Beige"],
  material: null,
  condition: "sehr_gut",
  defects: [],
  priceMinEur: 15,
  priceMaxEur: 22,
};
const goodAnalyze = {
  attributes: attrs,
  text: { title: "COS Strickpullover beige Gr. M", description: "Weicher Pullover.", hashtags: ["cos"] },
};
const analyzeBody = {
  photos: [{ mediaType: "image/jpeg", data: "AAAA" }],
  style: { language: "de", tone: "freundlich", closingText: "" },
};

function setup(outputs: unknown[] = []) {
  const parse = vi.fn(async () => {
    if (outputs.length === 0) throw new Error("no more outputs");
    return { parsed_output: outputs.shift(), stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 200 } };
  });
  const usageStore = new MemoryUsageStore();
  const app = createApp({
    anthropic: { messages: { parse } } as unknown as AnthropicLike,
    tokens: TOKENS,
    autofillEnabled: true,
    formMap: DEFAULT_FORM_MAP,
    usageStore,
    now: () => NOW,
  });
  return { app, parse, usageStore };
}

const auth = (token = TOKENS[1]!) => ({ Authorization: `Bearer ${token}` });
const post = (body: unknown, token?: string) => ({
  method: "POST",
  headers: { ...auth(token), "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("server app", () => {
  it("health needs no auth", async () => {
    const res = await setup().app.request("/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects missing and wrong tokens", async () => {
    const { app } = setup();
    for (const headers of [{}, auth("c".repeat(48)), { Authorization: TOKENS[0]! }]) {
      const res = await app.request("/v1/config", { headers });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
    expect((await app.request("/v1/analyze", { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("serves config and form map", async () => {
    const { app } = setup();
    const config = await app.request("/v1/config", { headers: auth() });
    expect(await config.json()).toEqual({ autofillEnabled: true, formMapVersion: DEFAULT_FORM_MAP.version });
    const fm = await app.request("/v1/form-map", { headers: auth() });
    expect(await fm.json()).toEqual({ formMap: DEFAULT_FORM_MAP });
  });

  it("analyze returns result + usage and records usage per token and month", async () => {
    const { app, parse, usageStore } = setup([goodAnalyze]);
    const res = await app.request("/v1/analyze", post(analyzeBody));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { text: { title: string } }; usage: unknown };
    expect(body.result.text.title).toContain("COS");
    expect(body.usage).toEqual({ inputTokens: 1000, outputTokens: 200 });
    expect(parse).toHaveBeenCalledTimes(1);
    expect(usageStore.snapshot()).toEqual({
      "2026-10": { "1": { requests: 1, inputTokens: 1000, outputTokens: 200, costEur: costEur(body.usage as never) } },
    });
    const usage = await app.request("/v1/usage", { headers: auth(TOKENS[0]) });
    expect(await usage.json()).toEqual({
      month: "2026-10",
      inputTokens: 1000,
      outputTokens: 200,
      costEur: costEur({ inputTokens: 1000, outputTokens: 200 }),
    });
  });

  it("rejects invalid bodies with 400 without calling the AI", async () => {
    const { app, parse } = setup();
    const bad = await app.request("/v1/analyze", post({ ...analyzeBody, photos: [] }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ kind: "bad_request", error: expect.stringContaining("photos") });
    const notJson = await app.request("/v1/choose", { method: "POST", headers: auth(), body: "nope" });
    expect(notJson.status).toBe(400);
    expect(parse).not.toHaveBeenCalled();
  });

  it("returns 502 with the AI error kind after two invalid outputs", async () => {
    const { app, parse, usageStore } = setup([{ nope: 1 }, null]);
    const res = await app.request("/v1/analyze", post(analyzeBody));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ kind: "invalid_output" });
    expect(parse).toHaveBeenCalledTimes(2);
    expect(usageStore.snapshot()).toEqual({});
  });

  it("routes choose and pick-element", async () => {
    const { app } = setup([{ choice: "M" }, { id: "e1" }]);
    const c = await app.request("/v1/choose", post({ field: "size", attributes: attrs, options: ["S", "M"] }));
    expect(((await c.json()) as { result: unknown }).result).toEqual({ choice: "M" });
    const els = [{ id: "e1", role: "button", label: "Zustand", text: "" }];
    const p = await app.request("/v1/pick-element", post({ goal: "Zustand öffnen", elements: els }));
    expect(((await p.json()) as { result: unknown }).result).toEqual({ id: "e1" });
  });

  it("answers CORS preflight for extension origins only", async () => {
    const { app } = setup();
    const preflight = (origin: string) =>
      app.request("/v1/analyze", {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" },
      });
    const ok = await preflight("chrome-extension://abcdefghijklmnopabcdefghijklmnop");
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("chrome-extension://abcdefghijklmnopabcdefghijklmnop");
    expect(ok.headers.get("Access-Control-Allow-Headers")).toBe("Authorization,Content-Type");
    const safari = await preflight("safari-web-extension://3F2504E0-4F89-11D3-9A0C-0305E82C3301");
    expect(safari.headers.get("Access-Control-Allow-Origin")).toBe("safari-web-extension://3F2504E0-4F89-11D3-9A0C-0305E82C3301");
    const evil = await preflight("https://evil.example");
    expect(evil.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects oversized bodies with 413", async () => {
    const { app, parse } = setup();
    const big = "A".repeat(16 * 1024 * 1024);
    const res = await app.request("/v1/analyze", post({ ...analyzeBody, photos: [{ mediaType: "image/jpeg", data: big }] }));
    expect(res.status).toBe(413);
    expect(parse).not.toHaveBeenCalled();
  });
});

describe("usage file store", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("persists and reloads aggregated counts", () => {
    dir = mkdtempSync(join(tmpdir(), "thrift-usage-"));
    const path = join(dir, "sub", "usage.json");
    const a = new FileUsageStore(path);
    a.add(0, { inputTokens: 10, outputTokens: 5 }, 0.001, "2026-10");
    a.add(1, { inputTokens: 20, outputTokens: 5 }, 0.002, "2026-10");
    a.add(0, { inputTokens: 1, outputTokens: 1 }, 0.0001, "2026-11");
    expect(Object.keys(JSON.parse(readFileSync(path, "utf8")))).toEqual(["2026-10", "2026-11"]);
    const b = new FileUsageStore(path);
    expect(b.month("2026-10")).toMatchObject({ requests: 2, inputTokens: 30, outputTokens: 10 });
    expect(b.month("2026-12").requests).toBe(0);
  });
});

describe("config", () => {
  let dir = "";
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));
  const base = { ANTHROPIC_API_KEY: "sk-test", THRIFT_TOKENS: `${TOKENS[0]}, ${TOKENS[1]}` };

  it("applies defaults", () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({ tokens: TOKENS, autofillEnabled: true, port: 8787, formMap: DEFAULT_FORM_MAP });
  });

  it("fails fast on missing or weak settings", () => {
    expect(() => loadConfig({ ...base, ANTHROPIC_API_KEY: "" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => loadConfig({ ANTHROPIC_API_KEY: "x" })).toThrow(/THRIFT_TOKENS/);
    expect(() => loadConfig({ ...base, THRIFT_TOKENS: "short" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, AUTOFILL_ENABLED: "maybe" })).toThrow(/AUTOFILL_ENABLED/);
    expect(loadConfig({ ...base, AUTOFILL_ENABLED: "false" }).autofillEnabled).toBe(false);
  });

  it("loads and validates FORM_MAP_PATH", () => {
    dir = mkdtempSync(join(tmpdir(), "thrift-fm-"));
    const good = join(dir, "fm.json");
    writeFileSync(good, JSON.stringify({ ...DEFAULT_FORM_MAP, version: "hotfix-1" }));
    expect(loadConfig({ ...base, FORM_MAP_PATH: good }).formMap.version).toBe("hotfix-1");
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ version: 1 }));
    expect(() => loadConfig({ ...base, FORM_MAP_PATH: bad })).toThrow(/not a valid form map/);
  });
});
