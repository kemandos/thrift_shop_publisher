import { browser } from "wxt/browser";
import { z } from "zod";
import { Language, Tone, type ListingStyle } from "@thrift/shared";

export const Settings = z.object({
  mode: z.enum(["direct", "server"]).default("direct"),
  apiKey: z.string().default(""),
  serverUrl: z.string().default(""),
  serverToken: z.string().default(""),
  language: Language.default("de"),
  tone: Tone.default("freundlich"),
  closingTextDe: z.string().default(""),
  closingTextEn: z.string().default(""),
  noticeAccepted: z.boolean().default(false),
});
export type Settings = z.infer<typeof Settings>;

export const DEFAULT_SETTINGS: Settings = Settings.parse({});

const KEY = "settings";

/** Keys the iPhone container app may provide through native messaging. */
const NATIVE_KEYS = [
  "mode",
  "apiKey",
  "serverUrl",
  "serverToken",
  "language",
  "tone",
  "closingTextDe",
  "closingTextEn",
] as const;

export function mergeSettings(local: Partial<Settings>, native: Partial<Settings>): Settings {
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS, ...local };
  // Values set in the iPhone app win over empty/default local values.
  for (const k of NATIVE_KEYS) {
    const v = native[k];
    if (v !== undefined && v !== "") merged[k] = v;
  }
  const parsed = Settings.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function loadLocalSettings(): Promise<Partial<Settings>> {
  const raw = (await browser.storage.local.get(KEY))[KEY];
  return raw && typeof raw === "object" ? (raw as Partial<Settings>) : {};
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadLocalSettings();
  const next = mergeSettings({ ...current, ...patch }, {});
  await browser.storage.local.set({ [KEY]: next });
  return next;
}

export function styleFrom(s: Settings, override?: Partial<Pick<Settings, "language" | "tone">>): ListingStyle {
  const language = override?.language ?? s.language;
  const tone = override?.tone ?? s.tone;
  return { language, tone, closingText: language === "de" ? s.closingTextDe : s.closingTextEn };
}

/** "••••••••3fA9" */
export function maskSecret(secret: string): string {
  if (!secret) return "";
  return `${"•".repeat(8)}${secret.slice(-4)}`;
}
