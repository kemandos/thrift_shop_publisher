import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/** Provider-neutral message parts. */
export type Part =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string };

export interface StructuredCall<S extends z.ZodTypeAny> {
  schema: S;
  /** Short schema name (letters, digits, underscore). */
  name: string;
  system: string;
  content: Part[];
  maxTokens: number;
  effort: "low" | "medium";
}

export interface StructuredReply {
  /** Parsed JSON (not yet validated), or null if the provider returned no/invalid JSON. */
  raw: unknown;
  stop: "ok" | "refusal" | "truncated";
  inputTokens: number;
  outputTokens: number;
  /** Exact cost in USD when the provider reports it (OpenRouter does). */
  costUsd?: number;
  /** Thinking tokens among the output tokens, when reported. */
  reasoningTokens?: number;
}

/** Minimal interface the listing logic needs from any model provider. */
export interface LlmClient {
  readonly model: string;
  structured<S extends z.ZodTypeAny>(call: StructuredCall<S>): Promise<StructuredReply>;
}

/** Thrown for transport/HTTP problems (not for invalid model output). */
export class LlmRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------------
// OpenRouter (OpenAI-compatible chat completions)
// ---------------------------------------------------------------------------------------------

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const HAIKU_MODEL = "anthropic/claude-haiku-5.5";
/** OpenRouter's Jev Router: picks model and effort per request; cost is reported per call. */
export const JEV_MODEL = "typesafe/jev-router";

export const DECISION_1_MODEL = "microsoft/microsoft-decision-1";

export const QWEN_FLASH_MODEL = "qwen/qwen3.7-flash";
export const DEEPSEEK_FLASH_MODEL = "deepseek/deepseek-v4.1-flash";

/** Photos → listing text (image input + structured outputs). */
export const TEXT_MODELS = [
  { id: HAIKU_MODEL, label: "Claude Haiku 5.5", note: "$0.10 / $0.50 pro 1 Mio. Tokens" },
  { id: QWEN_FLASH_MODEL, label: "Qwen3.7 Flash", note: "Günstig · $0.03 / $0.13" },
  { id: DEEPSEEK_FLASH_MODEL, label: "DeepSeek V4.1 Flash", note: "Günstig · ab $0.035 / $0.14" },
  { id: JEV_MODEL, label: "Jev Router", note: "Wählt selbst, Preis je Anfrage" },
] as const;


/** Clicking/navigation: choosing picker options and finding form elements. */
export const NAV_MODELS = [
  { id: DECISION_1_MODEL, label: "Microsoft Decision-1", note: "Entscheidungsmodell · $0.042 / gratis" },
  { id: HAIKU_MODEL, label: "Claude Haiku 5.5", note: "$0.10 / $0.50 pro 1 Mio. Tokens" },
  { id: JEV_MODEL, label: "Jev Router", note: "Wählt selbst, Preis je Anfrage" },
] as const;

/** @deprecated use TEXT_MODELS / NAV_MODELS */
export const OPENROUTER_MODELS = TEXT_MODELS;
export type TextModel = (typeof TEXT_MODELS)[number]["id"];
export type NavModel = (typeof NAV_MODELS)[number]["id"];
export type OpenRouterModel = TextModel;

/** Photos → listing text. */
export const DEFAULT_OPENROUTER_MODEL: TextModel = HAIKU_MODEL;
/** Clicking/navigation: Microsoft Decision-1 (owner's choice, 2026-10-11). */
export const DEFAULT_NAV_MODEL: NavModel = DECISION_1_MODEL;

/**
 * Converts a zod schema into a JSON schema accepted by strict structured outputs:
 * every object gets additionalProperties:false and all properties required.
 */
export function strictJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    delete n.$schema;
    if (n.type === "object" && n.properties && typeof n.properties === "object") {
      n.additionalProperties = false;
      n.required = Object.keys(n.properties as object);
    }
    for (const v of Object.values(n)) visit(v);
  };
  visit(js);
  return js;
}

/** Request strictness per model learned from "No endpoints found" (see openRouterLlm). */
const requestLevel = new Map<string, number>();

/** The JSON object in a reply; tolerates code fences or text around it (JSON mode). */
export function parseJsonObject(content: string): unknown {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(content.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string; code?: number };
}

export function openRouterLlm(opts: {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
  /** Shown in the OpenRouter dashboard. */
  appName?: string;
  /** Let the model think (reasoning). Off by default: faster and cheaper. */
  thinking?: boolean;
}): LlmClient {
  const model = opts.model?.trim() || DEFAULT_OPENROUTER_MODEL;
  const f = opts.fetch ?? fetch;
  /**
   * How strict the request can be for this model (learned once per client):
   * 0 = strict JSON schema (structured_outputs) + reasoning switch,
   * 1 = JSON mode with the schema in the prompt (e.g. Qwen: no provider offers structured_outputs),
   * 2 = JSON mode without the reasoning switch (last resort).
   * Thrift validates every answer against the zod schema anyway (one retry on invalid output).
   * Remembered per model for the lifetime of the worker/server, so only the first call pays the detour.
   */
  let level = requestLevel.get(model) ?? 0;

  async function send(call: StructuredCall<z.ZodTypeAny>, userContent: unknown[]): Promise<{ res: Response; json: OpenRouterResponse }> {
    const schema = strictJsonSchema(call.schema);
    const jsonMode = level >= 1;
    const system = jsonMode
      ? `${call.system}\n\nAnswer with exactly one JSON object and nothing else (no prose, no code fences). It must match this JSON schema:\n${JSON.stringify(schema)}`
      : call.system;
    const body = {
      model,
      max_tokens: call.maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      response_format: jsonMode
        ? { type: "json_object" }
        : { type: "json_schema", json_schema: { name: call.name, strict: true, schema } },
      // Thinking is one setting for all models (default off): listing data rarely needs it, and
      // Qwen/DeepSeek think by default (slow, billed as output).
      ...(level < 2 ? { reasoning: { enabled: opts.thinking === true } } : {}),
      // Only providers that honour these parameters; cheapest first.
      provider: { require_parameters: true, sort: "price" },
      usage: { include: true },
    };
    let res: Response;
    try {
      res = await f(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
          "X-Title": opts.appName ?? "Thrift",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new LlmRequestError(`OpenRouter nicht erreichbar: ${e instanceof Error ? e.message : String(e)}`);
    }
    const json = (await res.json().catch(() => ({}))) as OpenRouterResponse;
    return { res, json };
  }

  return {
    model,
    async structured(call) {
      const userContent = call.content.map((p) =>
        p.type === "text"
          ? { type: "text", text: p.text }
          : { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.data}` } },
      );
      let { res, json } = await send(call, userContent);
      // "No endpoints found that can handle the requested parameters": step down and try again.
      while ((!res.ok || json.error) && level < 2 && /no endpoints found/i.test(json.error?.message ?? "")) {
        level++;
        requestLevel.set(model, level);
        ({ res, json } = await send(call, userContent));
      }
      if (!res.ok || json.error) {
        const msg = json.error?.message ?? `HTTP ${res.status}`;
        throw new LlmRequestError(
          res.status === 401 ? "OpenRouter-Key ungültig" : res.status === 402 ? "OpenRouter-Guthaben aufgebraucht" : msg,
          res.status,
        );
      }
      const choice = json.choices?.[0];
      const content = choice?.message?.content ?? "";
      const raw = parseJsonObject(content);
      const finish = choice?.finish_reason ?? "";
      return {
        raw,
        stop: choice?.message?.refusal ? "refusal" : finish === "length" ? "truncated" : "ok",
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
        costUsd: typeof json.usage?.cost === "number" ? json.usage.cost : undefined,
        reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens,
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Anthropic (direct)
// ---------------------------------------------------------------------------------------------

export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5";

type ParseParams = Parameters<Anthropic["messages"]["parse"]>[0];

export function anthropicLlm(client: Anthropic, model: string = DEFAULT_ANTHROPIC_MODEL): LlmClient {
  return {
    model,
    async structured(call) {
      const content: Anthropic.ContentBlockParam[] = call.content.map((p) =>
        p.type === "text"
          ? { type: "text", text: p.text }
          : { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data } },
      );
      let res;
      try {
        res = await client.messages.parse({
          model,
          max_tokens: call.maxTokens,
          system: call.system,
          messages: [{ role: "user", content }],
          output_config: { effort: call.effort, format: zodOutputFormat(call.schema) },
        } as ParseParams);
      } catch (e) {
        throw new LlmRequestError(e instanceof Error ? e.message : String(e), (e as { status?: number }).status);
      }
      return {
        raw: res.parsed_output ?? null,
        stop: res.stop_reason === "refusal" ? "refusal" : res.stop_reason === "max_tokens" ? "truncated" : "ok",
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      };
    },
  };
}
