import type { z } from "zod";
import { AiError, type AiResponse } from "./ai";
import { DECISION_1_MODEL, LlmRequestError } from "./llm";
import {
  ChooseRequest,
  ChooseResult,
  PickElementRequest,
  PickElementResult,
  type Attributes,
  type Usage,
} from "./schemas";

/**
 * Decision models (OpenRouter Decisions API, alpha): instead of text they return a calibrated
 * probability per fixed option. Used for "Klicken & Navigieren": picking one option from a list.
 *
 * POST https://openrouter.ai/api/alpha/decisions
 *   { model, state, questions: { q: { type: "choice", instructions, criteria: { key: description } } } }
 * → { answers: { q: { type: "choice", choice, confidence?, probabilities? } }, usage: { input_tokens, output_tokens, cost } }
 */
export const OPENROUTER_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
export const DECISION_MODEL = DECISION_1_MODEL;
const DECISION_MODELS = new Set<string>([DECISION_MODEL]);

export const isDecisionModel = (model: string) => DECISION_MODELS.has(model);

/** Below this confidence an answer is not acted on (the field stays for the user). */
export const MIN_DECISION_CONFIDENCE = 0.6;

/** Option key meaning "none of these fits". */
export const NONE_KEY = "none";

export interface DecisionQuestion {
  state: unknown;
  instructions: string;
  /** key → description shown to the model. */
  options: Record<string, string>;
}

export interface Decision {
  choice: string | null;
  /** Probability of the chosen option (0–1), if the provider returns it. */
  confidence: number | null;
  usage: Usage;
}

export interface Decider {
  readonly model: string;
  decide(q: DecisionQuestion): Promise<Decision>;
}

interface DecisionsResponse {
  answers?: Record<string, { type?: string; choice?: string; confidence?: number; probabilities?: Record<string, number> }>;
  usage?: { input_tokens?: number; output_tokens?: number; inputTokens?: number; outputTokens?: number; cost?: number };
  error?: { message?: string };
}

export function openRouterDecider(opts: { apiKey: string; model?: string; fetch?: typeof fetch; appName?: string }): Decider {
  const model = opts.model ?? DECISION_MODEL;
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  return {
    model,
    async decide(q) {
      const body = {
        model,
        state: q.state,
        questions: { pick: { type: "choice", instructions: q.instructions, criteria: q.options } },
      };
      let res: Response;
      try {
        res = await f(OPENROUTER_DECISIONS_URL, {
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
      const json = (await res.json().catch(() => ({}))) as DecisionsResponse;
      if (!res.ok || json.error) {
        throw new LlmRequestError(
          res.status === 401 ? "OpenRouter-Key ungültig" : res.status === 402 ? "OpenRouter-Guthaben aufgebraucht" : (json.error?.message ?? `HTTP ${res.status}`),
          res.status,
        );
      }
      const a = json.answers?.pick;
      const u = json.usage ?? {};
      const usage: Usage = {
        inputTokens: u.input_tokens ?? u.inputTokens ?? 0,
        outputTokens: u.output_tokens ?? u.outputTokens ?? 0,
        ...(typeof u.cost === "number" ? { costUsd: u.cost } : {}),
      };
      const choice = a?.choice && a.choice in q.options ? a.choice : null;
      const confidence =
        typeof a?.confidence === "number" ? a.confidence : choice && a?.probabilities ? (a.probabilities[choice] ?? null) : null;
      return { choice, confidence, usage };
    },
  };
}

/** Facts the decision model needs about the item (no photos, no text). */
function itemState(attrs: Attributes, extra: Record<string, unknown> = {}) {
  return {
    item: {
      type: attrs.itemType,
      categoryPath: attrs.categoryPath,
      brand: attrs.brand,
      size: attrs.size,
      colors: attrs.colors,
      material: attrs.material,
      condition: attrs.condition,
      defects: attrs.defects,
    },
    ...extra,
  };
}

const key = (i: number) => `o${i + 1}`;

/** One option of a form field, decided by a decision model (same contract as `choose`). */
export async function chooseByDecision(decider: Decider, input: z.input<typeof ChooseRequest>): Promise<AiResponse<ChooseResult>> {
  const req = ChooseRequest.parse(input);
  const options: Record<string, string> = {};
  req.options.forEach((o, i) => (options[key(i)] = o));
  // A category tree level always gets the closest option; everything else may be "none".
  const mustPick = req.field === "category" && req.mode === "tree";
  if (!mustPick) options[NONE_KEY] = "None of the options fits / not supported by the facts";

  const instructions =
    req.field === "category" && req.mode === "tree"
      ? "This is one level of Vinted's category tree. Which option fits the item best? Department first (Damen/Herren/Kinder), then the closest sub-category; prefer a specific option over 'Sonstiges'."
      : req.field === "category"
        ? "These are Vinted's own category suggestions (name — path). Does one really fit the item: same department and the same kind of garment (a skirt is not shorts)? Otherwise choose none."
        : req.field === "other"
          ? `Which value of the field "${req.fieldLabel ?? ""}" do the item facts clearly support? If they do not, choose none.`
          : `Which option is the item's ${req.field}? Only an option the facts support; otherwise none.`;

  let d: Decision;
  try {
    d = await decider.decide({ state: itemState(req.attributes, { pathSoFar: req.pathSoFar }), instructions, options });
  } catch (e) {
    const kind = e instanceof LlmRequestError && e.status === 401 ? "unauthorized" : "request";
    throw new AiError(e instanceof Error ? e.message : String(e), kind);
  }
  const confident = mustPick || d.confidence === null || d.confidence >= MIN_DECISION_CONFIDENCE;
  const choice = d.choice && d.choice !== NONE_KEY && confident ? options[d.choice]! : null;
  return { result: ChooseResult.parse({ choice }), usage: d.usage };
}

/** AI element picking (renamed form fields) with a decision model. */
export async function pickElementByDecision(
  decider: Decider,
  input: z.input<typeof PickElementRequest>,
): Promise<AiResponse<PickElementResult>> {
  const req = PickElementRequest.parse(input);
  const options: Record<string, string> = {};
  for (const e of req.elements) options[e.id] = `${e.role} | ${e.label} | ${e.text}`.slice(0, 200);
  options[NONE_KEY] = "None of these elements";
  let d: Decision;
  try {
    d = await decider.decide({
      state: { goal: req.goal },
      instructions:
        "Which visible form element (role | label | text) matches the goal? Never a submit, upload, publish or save button; otherwise none.",
      options,
    });
  } catch (e) {
    throw new AiError(e instanceof Error ? e.message : String(e), "request");
  }
  const ok = d.choice && d.choice !== NONE_KEY && (d.confidence === null || d.confidence >= MIN_DECISION_CONFIDENCE);
  return { result: PickElementResult.parse({ id: ok ? d.choice : null }), usage: d.usage };
}
