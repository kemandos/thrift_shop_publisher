import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { DEFAULT_MODEL } from "./cost";
import {
  ANALYZE_SYSTEM,
  analyzeUserText,
  appendClosingText,
  CHOOSE_SYSTEM,
  chooseUserText,
  PICK_SYSTEM,
  pickUserText,
  REWRITE_SYSTEM,
  rewriteUserText,
} from "./prompts";
import {
  AnalyzeRequest,
  AnalyzeResult,
  Attributes,
  ChooseRequest,
  ChooseResult,
  Condition,
  ListingText,
  PickElementRequest,
  PickElementResult,
  RewriteRequest,
  type Usage,
} from "./schemas";

/**
 * Model-facing schemas: no length/range constraints (structured outputs support a JSON Schema subset).
 * Results are then validated against the strict schemas in schemas.ts.
 */
const ModelAttributes = z.object({
  itemType: z.string(),
  categoryPath: z.array(z.string()),
  brand: z.string().nullable(),
  brandEvidence: z.enum(["label", "logo", "none"]),
  size: z.string().nullable(),
  sizeEvidence: z.enum(["label", "none"]),
  colors: z.array(z.string()),
  material: z.string().nullable(),
  condition: Condition,
  defects: z.array(z.string()),
  priceMinEur: z.number(),
  priceMaxEur: z.number(),
});
const ModelText = z.object({ title: z.string(), description: z.string(), hashtags: z.array(z.string()) });
const ModelAnalyze = z.object({ attributes: ModelAttributes, text: ModelText });
const ModelChoice = z.object({ choice: z.string().nullable() });
const ModelPick = z.object({ id: z.string().nullable() });

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: "invalid_output" | "refusal" | "truncated" | "request",
  ) {
    super(message);
  }
}

export interface AiResponse<T> {
  result: T;
  usage: Usage;
}

export interface AiOptions {
  model?: string;
}

type ParseParams = Parameters<Anthropic["messages"]["parse"]>[0];

async function callStructured<S extends z.ZodTypeAny>(
  client: Anthropic,
  schema: S,
  params: Omit<ParseParams, "output_config"> & { effort: "low" | "medium" },
): Promise<{ data: z.infer<S>; usage: Usage }> {
  const { effort, ...rest } = params;
  let lastError: unknown;
  const total: Usage = { inputTokens: 0, outputTokens: 0 };
  // One retry on invalid output (spec: listing-ai "Valid, structured output").
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await client.messages.parse({
        ...rest,
        output_config: { effort, format: zodOutputFormat(schema) },
      } as ParseParams);
    } catch (e) {
      throw new AiError(e instanceof Error ? e.message : String(e), "request");
    }
    total.inputTokens += res.usage.input_tokens;
    total.outputTokens += res.usage.output_tokens;
    if (res.stop_reason === "refusal") throw new AiError("Model declined the request", "refusal");
    if (res.stop_reason === "max_tokens") {
      lastError = new AiError("Response was cut off", "truncated");
      continue;
    }
    const parsed = schema.safeParse(res.parsed_output);
    if (parsed.success) return { data: parsed.data, usage: total };
    lastError = new AiError("Response did not match the schema", "invalid_output");
  }
  throw lastError instanceof AiError ? lastError : new AiError("Invalid output", "invalid_output");
}

function normalizeAttributes(raw: z.infer<typeof ModelAttributes>): Attributes {
  const min = Math.max(1, Math.round(raw.priceMinEur));
  const max = Math.max(min, Math.round(raw.priceMaxEur));
  const a = {
    ...raw,
    // Evidence rules: no evidence → no value (never guessed).
    size: raw.sizeEvidence === "label" ? raw.size : null,
    brand: raw.brandEvidence === "none" ? null : raw.brand,
    colors: raw.colors.slice(0, 3),
    priceMinEur: min,
    priceMaxEur: max,
  };
  return Attributes.parse(a);
}

function normalizeText(raw: z.infer<typeof ModelText>, closingText: string): ListingText {
  return ListingText.parse({
    title: raw.title.trim().slice(0, 100),
    description: appendClosingText(raw.description, closingText).slice(0, 3000),
    hashtags: raw.hashtags.map((h) => h.replace(/^#/, "").trim().toLowerCase()).filter(Boolean).slice(0, 10),
  });
}

export async function analyze(client: Anthropic, input: z.input<typeof AnalyzeRequest>, opts: AiOptions = {}): Promise<AiResponse<AnalyzeResult>> {
  const req = AnalyzeRequest.parse(input);
  const content: Anthropic.ContentBlockParam[] = [];
  req.photos.forEach((p, i) => {
    content.push({ type: "text", text: `Photo ${i + 1}:` });
    content.push({ type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data } });
  });
  content.push({ type: "text", text: analyzeUserText(req.style, req.categoryOptions) });
  const { data, usage } = await callStructured(client, ModelAnalyze, {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: 8000,
    effort: "medium",
    system: ANALYZE_SYSTEM,
    messages: [{ role: "user", content }],
  });
  const result = AnalyzeResult.parse({
    attributes: normalizeAttributes(data.attributes),
    text: normalizeText(data.text, req.style.closingText),
  });
  return { result, usage };
}

export async function rewrite(client: Anthropic, input: z.input<typeof RewriteRequest>, opts: AiOptions = {}): Promise<AiResponse<ListingText>> {
  const req = RewriteRequest.parse(input);
  const { data, usage } = await callStructured(client, ModelText, {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: 4000,
    effort: "low",
    system: REWRITE_SYSTEM,
    messages: [{ role: "user", content: rewriteUserText(req.attributes, req.style) }],
  });
  return { result: normalizeText(data, req.style.closingText), usage };
}

export async function choose(client: Anthropic, input: z.input<typeof ChooseRequest>, opts: AiOptions = {}): Promise<AiResponse<ChooseResult>> {
  const req = ChooseRequest.parse(input);
  const { data, usage } = await callStructured(client, ModelChoice, {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: 2000,
    effort: "low",
    system: CHOOSE_SYSTEM,
    messages: [{ role: "user", content: chooseUserText(req) }],
  });
  // Only accept an option that really exists.
  const choice = data.choice !== null && req.options.includes(data.choice) ? data.choice : null;
  return { result: ChooseResult.parse({ choice }), usage };
}

export async function pickElement(
  client: Anthropic,
  input: z.input<typeof PickElementRequest>,
  opts: AiOptions = {},
): Promise<AiResponse<PickElementResult>> {
  const req = PickElementRequest.parse(input);
  const { data, usage } = await callStructured(client, ModelPick, {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: 2000,
    effort: "low",
    system: PICK_SYSTEM,
    messages: [{ role: "user", content: pickUserText(req.goal, req.elements) }],
  });
  const id = data.id !== null && req.elements.some((e) => e.id === data.id) ? data.id : null;
  return { result: PickElementResult.parse({ id }), usage };
}
