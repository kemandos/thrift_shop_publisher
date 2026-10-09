import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  AiError,
  analyze,
  AnalyzeRequest,
  Attributes,
  choose,
  costEur,
  DEFAULT_FORM_MAP,
  FormMap,
  formatEur,
  pickElement,
  rewrite,
  styleInstruction,
  TONES,
  LANGUAGES,
  anthropicLlm,
  openRouterLlm,
  strictJsonSchema,
  OPENROUTER_URL,
} from "../src";
import { z } from "zod";

const attrs: Attributes = {
  itemType: "Strickpullover",
  categoryPath: ["Damen", "Pullover"],
  brand: "COS",
  brandEvidence: "label",
  size: "M",
  sizeEvidence: "label",
  colors: ["Beige"],
  material: "70 % Wolle",
  condition: "sehr_gut",
  defects: [],
  priceMinEur: 15,
  priceMaxEur: 22,
};

function fakeClient(outputs: Array<{ parsed: unknown; stop?: string }>) {
  const parse = vi.fn(async (_params: unknown) => {
    const o = outputs.shift();
    if (!o) throw new Error("no more outputs");
    return { parsed_output: o.parsed, stop_reason: o.stop ?? "end_turn", usage: { input_tokens: 1000, output_tokens: 200 } };
  });
  return { client: anthropicLlm({ messages: { parse } } as unknown as Anthropic), parse };
}

const photo = { mediaType: "image/jpeg" as const, data: "AAAA" };
const style = { language: "de" as const, tone: "freundlich" as const, closingText: "Versand in 2 Tagen." };

describe("schemas", () => {
  it("accepts a valid analyze request and rejects too many photos", () => {
    expect(AnalyzeRequest.safeParse({ photos: [photo], style }).success).toBe(true);
    expect(AnalyzeRequest.safeParse({ photos: Array(7).fill(photo), style }).success).toBe(false);
    expect(AnalyzeRequest.safeParse({ photos: [], style }).success).toBe(false);
  });
  it("only allows Deutsch and English", () => {
    expect(LANGUAGES).toEqual(["de", "en"]);
    expect(AnalyzeRequest.safeParse({ photos: [photo], style: { ...style, language: "fr" } }).success).toBe(false);
  });
  it("default form map is valid and forbids upload clicks", () => {
    const m = FormMap.parse(DEFAULT_FORM_MAP);
    expect(m.forbiddenClickText).toContain("hochladen");
    expect(Object.keys(m.fields)).toContain("price");
  });
});

describe("prompts", () => {
  it.each(LANGUAGES.flatMap((l) => TONES.map((t) => [l, t] as const)))("style instruction %s/%s", (language, tone) => {
    const s = styleInstruction({ language, tone, closingText: "" });
    expect(s).toContain(language === "de" ? "Deutsch" : "English");
  });
});

describe("ai runner", () => {
  const good = {
    attributes: { ...attrs, priceMinEur: 14.6, priceMaxEur: 21.9 },
    text: { title: "COS Strickpullover beige Gr. M", description: "Weicher Pullover.", hashtags: ["#cos", "Pullover"] },
  };

  it("analyze returns normalized result, appends closing text and sums usage", async () => {
    const { client, parse } = fakeClient([{ parsed: good }]);
    const r = await analyze(client, { photos: [photo], style, categoryOptions: ["Damen", "Herren"] });
    expect(r.result.text.description).toBe("Weicher Pullover.\n\nVersand in 2 Tagen.");
    expect(r.result.text.hashtags).toEqual(["cos", "pullover"]);
    expect(r.result.attributes.priceMinEur).toBe(15);
    expect(r.usage).toEqual({ inputTokens: 1000, outputTokens: 200 });
    const call = parse.mock.calls[0]![0] as { model: string; messages: Array<{ content: Array<{ type: string }> }> };
    expect(call.model).toBe("claude-haiku-5-5");
    expect(call.messages[0]!.content.filter((c) => c.type === "image")).toHaveLength(1);
  });

  it("drops size and brand without evidence", async () => {
    const guessed = {
      ...good,
      attributes: { ...good.attributes, size: "M", sizeEvidence: "none", brand: "COS", brandEvidence: "none" },
    };
    const { client } = fakeClient([{ parsed: guessed }]);
    const r = await analyze(client, { photos: [photo], style });
    expect(r.result.attributes.size).toBeNull();
    expect(r.result.attributes.brand).toBeNull();
  });

  it("retries once on invalid output, then fails", async () => {
    const { client, parse } = fakeClient([{ parsed: { nope: 1 } }, { parsed: null }]);
    await expect(analyze(client, { photos: [photo], style })).rejects.toMatchObject({ kind: "invalid_output" });
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("succeeds on retry after one invalid output", async () => {
    const { client } = fakeClient([{ parsed: null }, { parsed: good }]);
    const r = await analyze(client, { photos: [photo], style });
    expect(r.usage.inputTokens).toBe(2000);
  });

  it("surfaces refusals", async () => {
    const { client } = fakeClient([{ parsed: null, stop: "refusal" }]);
    await expect(analyze(client, { photos: [photo], style })).rejects.toBeInstanceOf(AiError);
  });

  it("rewrite uses text only", async () => {
    const { client, parse } = fakeClient([{ parsed: good.text }]);
    const r = await rewrite(client, { attributes: attrs, style: { ...style, language: "en", closingText: "" } });
    expect(r.result.title).toContain("COS");
    const call = parse.mock.calls[0]![0] as { messages: Array<{ content: Array<{ type: string }> }> };
    expect(call.messages[0]!.content.every((c) => c.type === "text")).toBe(true);
  });

  it("choose only accepts offered options", async () => {
    const opts = ["XS", "S", "M", "L"];
    const ok = fakeClient([{ parsed: { choice: "M" } }]);
    expect((await choose(ok.client, { field: "size", attributes: attrs, options: opts })).result.choice).toBe("M");
    const bad = fakeClient([{ parsed: { choice: "38" } }]);
    expect((await choose(bad.client, { field: "size", attributes: attrs, options: opts })).result.choice).toBeNull();
  });

  it("pickElement only accepts known ids", async () => {
    const els = [{ id: "e1", role: "button", label: "Zustand", text: "Wähle" }];
    const ok = fakeClient([{ parsed: { id: "e1" } }]);
    expect((await pickElement(ok.client, { goal: "Zustand öffnen", elements: els })).result.id).toBe("e1");
    const bad = fakeClient([{ parsed: { id: "e9" } }]);
    expect((await pickElement(bad.client, { goal: "x", elements: els })).result.id).toBeNull();
  });
});

describe("openrouter", () => {
  const good = {
    attributes: attrs,
    text: { title: "COS Strickpullover beige Gr. M", description: "Weicher Pullover.", hashtags: ["cos"] },
  };
  function fakeFetch(replies: Array<{ status?: number; body: unknown }>) {
    const f = vi.fn(async (_url: string, _init: RequestInit) => {
      const r = replies.shift();
      if (!r) throw new Error("no more replies");
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
    });
    return f;
  }
  const reply = (content: unknown, finish = "stop", cost = 0.0002) => ({
    body: {
      choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: finish }],
      usage: { prompt_tokens: 1200, completion_tokens: 300, cost },
    },
  });

  it("sends images as data URLs with a strict JSON schema and uses the reported cost", async () => {
    const f = fakeFetch([reply(good)]);
    const llm = openRouterLlm({ apiKey: "sk-or-test", fetch: f as unknown as typeof fetch });
    const r = await analyze(llm, { photos: [photo], style });
    expect(r.result.attributes.size).toBe("M");
    expect(r.usage).toEqual({ inputTokens: 1200, outputTokens: 300, costUsd: 0.0002 });
    expect(costEur(r.usage)).toBeCloseTo(0.0002 * 0.92, 8);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(OPENROUTER_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("anthropic/claude-haiku-5.5");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.provider.require_parameters).toBe(true);
    const parts = body.messages[1].content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts.find((p) => p.type === "image_url")!.image_url!.url).toBe("data:image/jpeg;base64,AAAA");
  });

  it("retries once on unparsable JSON and treats length as truncated", async () => {
    const f = fakeFetch([reply("{not json"), reply(good)]);
    const r = await analyze(openRouterLlm({ apiKey: "k", fetch: f as unknown as typeof fetch }), { photos: [photo], style });
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.usage.costUsd).toBeCloseTo(0.0004, 8);
    const t = fakeFetch([reply("{", "length"), reply("{", "length")]);
    await expect(
      analyze(openRouterLlm({ apiKey: "k", fetch: t as unknown as typeof fetch }), { photos: [photo], style }),
    ).rejects.toMatchObject({ kind: "truncated" });
  });

  it("maps HTTP errors to readable messages", async () => {
    const f = fakeFetch([{ status: 401, body: { error: { message: "No auth" } } }]);
    await expect(
      rewrite(openRouterLlm({ apiKey: "bad", fetch: f as unknown as typeof fetch }), { attributes: attrs, style }),
    ).rejects.toMatchObject({ kind: "unauthorized", message: "OpenRouter-Key ungültig" });
    const g = fakeFetch([{ status: 402, body: { error: { message: "credits" } } }]);
    await expect(
      rewrite(openRouterLlm({ apiKey: "k", fetch: g as unknown as typeof fetch }), { attributes: attrs, style }),
    ).rejects.toMatchObject({ kind: "request", message: "OpenRouter-Guthaben aufgebraucht" });
  });

  it("uses the chosen model (Jev Router)", async () => {
    const f = fakeFetch([reply({ choice: "M" })]);
    const llm = openRouterLlm({ apiKey: "k", model: "typesafe/jev-router", fetch: f as unknown as typeof fetch });
    const r = await choose(llm, { field: "size", attributes: attrs, options: ["S", "M"] });
    expect(r.result.choice).toBe("M");
    expect(JSON.parse(f.mock.calls[0]![1].body as string).model).toBe("typesafe/jev-router");
  });

  it("strict schema: every object closed and fully required", () => {
    const js = strictJsonSchema(z.object({ a: z.string(), b: z.object({ c: z.number().nullable() }) })) as {
      additionalProperties: boolean;
      required: string[];
      properties: { b: { additionalProperties: boolean; required: string[] } };
    };
    expect(js.additionalProperties).toBe(false);
    expect(js.required).toEqual(["a", "b"]);
    expect(js.properties.b).toMatchObject({ additionalProperties: false, required: ["c"] });
  });
});

describe("cost", () => {
  it("computes Haiku cost and formats in cents", () => {
    const eur = costEur({ inputTokens: 10_000, outputTokens: 1_000 });
    expect(eur).toBeCloseTo(0.00138, 5);
    expect(formatEur(eur)).toBe("ca. 0,1 ct");
    expect(formatEur(1.5)).toBe("ca. 1,50 €");
  });
});
