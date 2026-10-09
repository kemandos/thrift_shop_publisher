import Anthropic from "@anthropic-ai/sdk";
import {
  analyze,
  API_PATHS,
  choose,
  DEFAULT_FORM_MAP,
  FormMap,
  pickElement,
  rewrite,
  ServerConfig,
  Usage,
  type AiResponse,
} from "@thrift/shared";
import type { AiResults, Request } from "./messages";
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
}

/** Direct mode: the user's own Anthropic key, called from the background worker. */
export function directTransport(apiKey: string, makeClient = defaultClient): Transport {
  if (!apiKey.trim()) throw new TransportError("Kein API-Key gespeichert", "no_key");
  const client = makeClient(apiKey.trim());
  const ops = { analyze, rewrite, choose, pickElement } as const;
  return {
    async call(op, payload) {
      const fn = ops[op] as (c: Anthropic, p: unknown) => Promise<AiResponse<never>>;
      return fn(client, payload);
    },
    async formMap() {
      return DEFAULT_FORM_MAP;
    },
    async test() {
      await client.models.list({ limit: 1 });
    },
  };
}

function defaultClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

const OP_PATH: Record<AiOp, string> = {
  analyze: API_PATHS.analyze,
  rewrite: API_PATHS.rewrite,
  choose: API_PATHS.choose,
  pickElement: API_PATHS.pickElement,
};

/** Server mode: the owner's own server holds the Anthropic key. */
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
  };
}

export function transportFor(s: Settings): Transport {
  return s.mode === "server" ? serverTransport(s.serverUrl, s.serverToken) : directTransport(s.apiKey);
}
