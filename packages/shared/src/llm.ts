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

/** The only two models offered (both: image input + structured outputs). */
export const OPENROUTER_MODELS = [
  { id: HAIKU_MODEL, label: "Claude Haiku 5.5", note: "$0.10 / $0.50 pro 1 Mio. Tokens" },
  { id: JEV_MODEL, label: "Jev Router", note: "Wählt selbst, Preis je Anfrage" },
] as const;
export type OpenRouterModel = (typeof OPENROUTER_MODELS)[number]["id"];

/** Photos → listing text. */
export const DEFAULT_OPENROUTER_MODEL: OpenRouterModel = HAIKU_MODEL;
/** Clicking/navigation: choosing picker options and finding form elements. */
export const DEFAULT_NAV_MODEL: OpenRouterModel = JEV_MODEL;

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

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string; code?: number };
}

export function openRouterLlm(opts: {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
  /** Shown in the OpenRouter dashboard. */
  appName?: string;
}): LlmClient {
  const model = opts.model?.trim() || DEFAULT_OPENROUTER_MODEL;
  const f = opts.fetch ?? fetch;
  return {
    model,
    async structured(call) {
      const userContent = call.content.map((p) =>
        p.type === "text"
          ? { type: "text", text: p.text }
          : { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.data}` } },
      );
      const body = {
        model,
        max_tokens: call.maxTokens,
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: userContent },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: call.name, strict: true, schema: strictJsonSchema(call.schema) },
        },
        // No `reasoning` here: together with require_parameters it would exclude non-reasoning models.
        // Only route to providers that honour response_format.
        provider: { require_parameters: true },
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
      if (!res.ok || json.error) {
        const msg = json.error?.message ?? `HTTP ${res.status}`;
        throw new LlmRequestError(
          res.status === 401 ? "OpenRouter-Key ungültig" : res.status === 402 ? "OpenRouter-Guthaben aufgebraucht" : msg,
          res.status,
        );
      }
      const choice = json.choices?.[0];
      const content = choice?.message?.content ?? "";
      let raw: unknown;
      try {
        raw = content ? JSON.parse(content) : null;
      } catch {
        raw = null;
      }
      const finish = choice?.finish_reason ?? "";
      return {
        raw,
        stop: choice?.message?.refusal ? "refusal" : finish === "length" ? "truncated" : "ok",
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
        costUsd: typeof json.usage?.cost === "number" ? json.usage.cost : undefined,
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
