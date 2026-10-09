import { fakeBrowser } from "wxt/testing/fake-browser";
import { DEFAULT_SETTINGS, loadLocalSettings, maskSecret, mergeSettings, saveSettings, styleFrom } from "@/src/settings";

describe("settings", () => {
  beforeEach(() => fakeBrowser.reset());

  it("defaults to OpenRouter with Claude Haiku 5.5, Deutsch, Freundlich, notice not accepted", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      mode: "openrouter",
      model: "anthropic/claude-haiku-5.5",
      navModel: "typesafe/jev-router",
      language: "de",
      tone: "freundlich",
      noticeAccepted: false,
    });
  });

  it("only allows Haiku and Jev; anything else falls back to the default", () => {
    expect(mergeSettings({ model: "typesafe/jev-router", navModel: "anthropic/claude-haiku-5.5" }, {})).toMatchObject({
      model: "typesafe/jev-router",
      navModel: "anthropic/claude-haiku-5.5",
    });
    expect(mergeSettings({ model: "qwen/qwen3.7-flash" as never }, {}).model).toBe("anthropic/claude-haiku-5.5");
    expect(mergeSettings({ mode: "direct" as never, apiKey: "k" }, {})).toMatchObject({ mode: "openrouter", apiKey: "k" });
  });

  it("native (iPhone app) values win over empty local values", () => {
    const s = mergeSettings({ apiKey: "", language: "de" }, { apiKey: "sk-or-native", language: "en" });
    expect(s.apiKey).toBe("sk-or-native");
    expect(s.language).toBe("en");
  });

  it("rejects unsupported languages by falling back to defaults", () => {
    const s = mergeSettings({ language: "fr" as never }, {});
    expect(s.language).toBe("de");
  });

  it("persists only locally and round-trips", async () => {
    await saveSettings({ apiKey: "sk-or-123456", tone: "locker" });
    const local = await loadLocalSettings();
    expect(local.apiKey).toBe("sk-or-123456");
    expect(local.tone).toBe("locker");
  });

  it("masks secrets to the last 4 characters", () => {
    expect(maskSecret("sk-or-abcdef3fA9")).toBe("••••••••3fA9");
    expect(maskSecret("")).toBe("");
  });

  it("uses the closing text of the chosen language", () => {
    const s = mergeSettings({ closingTextDe: "Versand in 2 Tagen.", closingTextEn: "Ships in 2 days." }, {});
    expect(styleFrom(s).closingText).toBe("Versand in 2 Tagen.");
    expect(styleFrom(s, { language: "en" }).closingText).toBe("Ships in 2 days.");
  });
});
