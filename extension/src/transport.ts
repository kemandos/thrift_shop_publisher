import {
  analyze,
  API_PATHS,
  choose,
  DEFAULT_FORM_MAP,
  FormMap,
  openRouterLlm,
  pickElement,
  type LlmClient,
  rewrite,
  ServerConfig,
  Usage,
  type AiResponse,
} from "@thrift/shared";
import type { AiResults, Balance, Request } from "./messages";
import type { Settings } from "./settings";

export type AiOp = keyof AiResults;
type AiRequest = Extract<Request, { type: "ai" }>;

export class TransportError extends Error {
  constructor(
    message: string,
    readonly kind: string,
  ) {
    super(message);
  }
}

export interface Transport {
  call<K extends AiOp>(op: K, payload: Extract<AiRequest, { op: K }>["payload"]): Promise<AiResponse<AiResults[K]>>;
  formMap(): Promise<FormMap>;
  test(): Promise<void>;
  /** Remaining OpenRouter credit, if this transport knows it. */
  balance(): Promise<Balance | null>;
}

export const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";
export const OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits";

/** Default mode: the user's own OpenRouter key, called from the background worker. */
export function openRouterTransport(
  apiKey: string,
  models: { model: string; navModel: string },
  fetchFn: typeof fetch = (...a) => fetch(...a),
): Transport {
  const key = apiKey.trim();
  if (!key) throw new TransportError("Kein OpenRouter-Key gespeichert", "no_key");
  const text = openRouterLlm({ apiKey: key, model: models.model, fetch: fetchFn });
  const nav = openRouterLlm({ apiKey: key, model: models.navModel, fetch: fetchFn });
  // Photos and text go to the text model; option choosing and element finding to the navigation model.
  const ops = {
    analyze: [analyze, text],
    rewrite: [rewrite, text],
    choose: [choose, nav],
    pickElement: [pickElement, nav],
  } as const;
  return {
    async call(op, payload) {
      const [fn, llm] = ops[op] as unknown as [(l: LlmClient, p: unknown) => Promise<AiResponse<never>>, LlmClient];
      return fn(llm, payload);
    },
    async formMap() {
      return DEFAULT_FORM_MAP;
    },
    async test() {
      let res: globalThis.Response;
      try {
        res = await fetchFn(OPENROUTER_KEY_URL, { headers: { Authorization: `Bearer ${key}` } });
      } catch {
        throw new TransportError("OpenRouter nicht erreichbar", "network");
      }
      if (res.status === 401) throw new TransportError("OpenRouter-Key ungültig", "unauthorized");
      if (!res.ok) throw new TransportError(`OpenRouter-Fehler ${res.status}`, "server");
    },
    async balance() {
      const get = async (url: string) => {
        const res = await fetchFn(url, { headers: { Authorization: `Bearer ${key}` } }).catch(() => null);
        return res?.ok ? ((await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null) : null;
      };
      // Account balance = purchased credits − usage.
      const credits = (await get(OPENROUTER_CREDITS_URL))?.data;
      if (typeof credits?.total_credits === "number" && typeof credits?.total_usage === "number") {
        return { remainingUsd: Math.max(0, credits.total_credits - credits.total_usage), source: "credits" };
      }
      // Fallback: remaining limit of this key, if the key has a limit.
      const keyInfo = (await get(OPENROUTER_KEY_URL))?.data;
      if (typeof keyInfo?.limit_remaining === "number") return { remainingUsd: keyInfo.limit_remaining, source: "key-limit" };
      return null;
    },
  };
}

const OP_PATH: Record<AiOp, string> = {
  analyze: API_PATHS.analyze,
  rewrite: API_PATHS.rewrite,
  choose: API_PATHS.choose,
  pickElement: API_PATHS.pickElement,
};

/** Server mode: the owner's own server holds the OpenRouter key. */
export function serverTransport(baseUrl: string, token: string, fetchFn: typeof fetch = fetch): Transport {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) throw new TransportError("Server-URL fehlt oder ist ungültig", "no_server");
  if (!token.trim()) throw new TransportError("Server-Token fehlt", "no_token");
  const headers = { Authorization: `Bearer ${token.trim()}`, "Content-Type": "application/json" };

  async function req(path: string, init?: RequestInit): Promise<unknown> {
    let res: globalThis.Response;
    try {
      res = await fetchFn(`${base}${path}`, { ...init, headers });
    } catch {
      throw new TransportError("Server nicht erreichbar", "network");
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string; kind?: string };
    if (res.status === 401) throw new TransportError("Server-Token ungültig", "unauthorized");
    if (!res.ok) throw new TransportError(body.error ?? `Serverfehler ${res.status}`, body.kind ?? "server");
    return body;
  }

  let config: { value: ServerConfig; at: number } | null = null;
  async function ensureEnabled() {
    if (!config || Date.now() - config.at > 5 * 60_000) {
      config = { value: ServerConfig.parse(await req(API_PATHS.config)), at: Date.now() };
    }
    if (!config.value.autofillEnabled) {
      throw new TransportError("Automatisches Ausfüllen ist auf dem Server deaktiviert", "disabled");
    }
  }

  return {
    async call(op, payload) {
      await ensureEnabled();
      const body = (await req(OP_PATH[op], { method: "POST", body: JSON.stringify(payload) })) as {
        result: AiResults[typeof op];
        usage: unknown;
      };
      return { result: body.result, usage: Usage.parse(body.usage) };
    },
    async formMap() {
      // A broken or unreachable server must not break the page: fall back to the bundled map.
      try {
        const body = (await req(API_PATHS.formMap)) as { formMap: unknown };
        return FormMap.parse(body.formMap);
      } catch {
        return DEFAULT_FORM_MAP;
      }
    },
    async test() {
      await req(API_PATHS.config);
    },
    async balance() {
      return null; // the server holds the key
    },
  };
}

export function transportFor(s: Settings): Transport {
  return s.mode === "server" ? serverTransport(s.serverUrl, s.serverToken) : openRouterTransport(s.apiKey, s);
}
