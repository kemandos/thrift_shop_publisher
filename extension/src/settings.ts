import { browser } from "wxt/browser";
import { z } from "zod";
import {
  DEFAULT_NAV_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  HAIKU_MODEL,
  JEV_MODEL,
  Language,
  MAX_CUSTOM_INSTRUCTIONS,
  Tone,
  type ListingStyle,
} from "@thrift/shared";

const Model = z.enum([HAIKU_MODEL, JEV_MODEL]);

export const Settings = z.object({
  /** "openrouter": own OpenRouter key (default). "server": optional own server holds the key. */
  mode: z.enum(["openrouter", "server"]).catch("openrouter"),
  /** OpenRouter API key (sk-or-…). */
  apiKey: z.string().default(""),
  /** Model for photos → listing text (Claude Haiku 5.5 by default). */
  model: Model.catch(DEFAULT_OPENROUTER_MODEL),
  /** Model for clicking/navigation: picker options and element finding (Jev Router by default). */
  navModel: Model.catch(DEFAULT_NAV_MODEL),
  serverUrl: z.string().default(""),
  serverToken: z.string().default(""),
  language: Language.default("de"),
  tone: Tone.default("freundlich"),
  /** Own instruction for the listing text, entered in the panel next to "Ausfüllen" (wording only). */
  customPrompt: z.string().max(MAX_CUSTOM_INSTRUCTIONS).catch(""),
  noticeAccepted: z.boolean().default(false),
  /** Panel position on vinted.de (per device, so the iPhone and the Mac can differ). */
  panelDock: z.enum(["bottom", "top"]).catch("bottom"),
  panelCollapsed: z.boolean().catch(false),
});
export type Settings = z.infer<typeof Settings>;

export const DEFAULT_SETTINGS: Settings = Settings.parse({});

const KEY = "settings";

/** Keys the iPhone container app may provide through native messaging. */
const NATIVE_KEYS = [
  "mode",
  "apiKey",
  "model",
  "navModel",
  "serverUrl",
  "serverToken",
  "language",
  "tone",
  "customPrompt",
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

export function styleFrom(
  s: Settings,
  override?: Partial<Pick<Settings, "language" | "tone" | "customPrompt">>,
): ListingStyle {
  const language = override?.language ?? s.language;
  const tone = override?.tone ?? s.tone;
  return {
    language,
    tone,
    closingText: "",
    customInstructions: (override?.customPrompt ?? s.customPrompt).trim().slice(0, MAX_CUSTOM_INSTRUCTIONS),
  };
}

/** "••••••••3fA9" */
export function maskSecret(secret: string): string {
  if (!secret) return "";
  return `${"•".repeat(8)}${secret.slice(-4)}`;
}
