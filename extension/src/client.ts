import { browser } from "wxt/browser";
import type { AiApi } from "./fill/fill";
import type { AiResults, Request, Response, ResponseMap } from "./messages";

export class ClientError extends Error {
  constructor(
    message: string,
    readonly kind?: string,
  ) {
    super(message);
  }
}

async function send<T>(msg: Request, attempts = 3): Promise<T> {
  let res: Response<T> | undefined;
  // The background service worker may still be starting; retry briefly.
  for (let i = 0; i < attempts && !res; i++) {
    res = (await browser.runtime.sendMessage(msg).catch(() => undefined)) as Response<T> | undefined;
    if (!res && i < attempts - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  if (!res) throw new ClientError("Keine Antwort vom Hintergrunddienst");
  if (!res.ok) throw new ClientError(res.error, res.kind);
  return res.data;
}

export const bg = {
  get: <K extends keyof ResponseMap>(type: K) => send<ResponseMap[K]>({ type } as Request),
};

type AiReq<K extends keyof AiResults> = Extract<Request, { type: "ai"; op: K }>["payload"];

/** AI calls proxied through the background worker (keys never live in the page). */
export const aiViaBackground: AiApi = {
  analyze: (p) => send({ type: "ai", op: "analyze", payload: p as AiReq<"analyze"> }),
  rewrite: (p) => send({ type: "ai", op: "rewrite", payload: p as AiReq<"rewrite"> }),
  choose: (p) => send({ type: "ai", op: "choose", payload: p as AiReq<"choose"> }),
  pickElement: (p) => send({ type: "ai", op: "pickElement", payload: p as AiReq<"pickElement"> }),
};
