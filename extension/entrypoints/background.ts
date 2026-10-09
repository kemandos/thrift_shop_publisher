import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { addUsage, DEFAULT_FORM_MAP, type Usage } from "@thrift/shared";
import type { Balance, Request, Response } from "@/src/messages";
import { loadLocalSettings, mergeSettings, type Settings } from "@/src/settings";
import { transportFor, TransportError } from "@/src/transport";
import { recordCall, summary } from "@/src/usageStore";

/** Native app id of the iPhone container (Safari only). */
const NATIVE_APP_ID = "app.thrift.companion.extension";

async function nativeMessage(msg: unknown): Promise<unknown> {
  const rt = browser.runtime as unknown as { sendNativeMessage?: (id: string, m: unknown) => Promise<unknown> };
  if (!import.meta.env.SAFARI || typeof rt.sendNativeMessage !== "function") return null;
  try {
    return await rt.sendNativeMessage(NATIVE_APP_ID, msg);
  } catch {
    return null;
  }
}

async function getSettings(): Promise<Settings> {
  const local = await loadLocalSettings();
  const native = (await nativeMessage({ type: "getSettings" })) as { settings?: Partial<Settings> } | null;
  return mergeSettings(local, native?.settings ?? {});
}

const kv = {
  get: (k: string) => browser.storage.local.get(k) as Promise<Record<string, unknown>>,
  set: (items: Record<string, unknown>) => browser.storage.local.set(items),
};

let balanceCache: { value: Balance | null; at: number } | null = null;

/** Usage of the fill in progress per tab; flushed when an analyze starts a new fill. */
const pending = new Map<number, Usage>();

async function handle(msg: Request, tabId: number | undefined): Promise<unknown> {
  switch (msg.type) {
    case "getSettings":
      return getSettings();
    case "getFormMap":
      // Must never fail: the panel has to appear even before a key/server is configured.
      try {
        return await transportFor(await getSettings()).formMap();
      } catch {
        return DEFAULT_FORM_MAP;
      }
    case "getUsage":
      return summary(kv);
    case "getBalance": {
      // Cached for a minute; refreshed after each fill by the caller.
      if (balanceCache && Date.now() - balanceCache.at < 60_000) return balanceCache.value;
      const value = await transportFor(await getSettings())
        .balance()
        .catch(() => null);
      balanceCache = { value, at: Date.now() };
      return value;
    }
    case "testConnection":
      await transportFor(await getSettings()).test();
      return { ok: true };
    case "heartbeat":
      await nativeMessage({ type: "heartbeat" });
      return { ok: true };
    case "ai": {
      const t = transportFor(await getSettings());
      const res = await t.call(msg.op as never, msg.payload as never);
      const key = tabId ?? -1;
      const total =
        msg.op === "analyze" ? res.usage : addUsage(pending.get(key) ?? { inputTokens: 0, outputTokens: 0 }, res.usage);
      pending.set(key, total);
      await recordCall(kv, res.usage, total);
      balanceCache = null;
      return res;
    }
  }
}

export default defineBackground(() => {
  // A new key or mode means a different balance.
  browser.storage.onChanged.addListener(() => {
    balanceCache = null;
  });
  // Chrome does not accept a returned Promise from onMessage listeners: reply via sendResponse and return true.
  browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse: (r: Response<unknown>) => void) => {
    handle(msg as Request, sender.tab?.id).then(
      (data) => sendResponse({ ok: true, data }),
      (e: unknown) =>
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          kind: e instanceof TransportError ? e.kind : (e as { kind?: string })?.kind,
        }),
    );
    return true;
  });
});
