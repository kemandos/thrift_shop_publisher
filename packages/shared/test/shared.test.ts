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
} from "../src";

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
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
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
    const call = parse.mock.calls[0]![0] as { messages: Array<{ content: unknown }> };
    expect(typeof call.messages[0]!.content).toBe("string");
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

describe("cost", () => {
  it("computes Haiku cost and formats in cents", () => {
    const eur = costEur({ inputTokens: 10_000, outputTokens: 1_000 });
    expect(eur).toBeCloseTo(0.00138, 5);
    expect(formatEur(eur)).toBe("ca. 0,1 ct");
    expect(formatEur(1.5)).toBe("ca. 1,50 €");
  });
});
