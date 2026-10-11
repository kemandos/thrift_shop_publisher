import { fakeBrowser } from "wxt/testing/fake-browser";
import { DEFAULT_SETTINGS, loadLocalSettings, maskSecret, mergeSettings, saveSettings, styleFrom } from "@/src/settings";

describe("settings", () => {
  beforeEach(() => fakeBrowser.reset());

  it("defaults to OpenRouter with Claude Haiku 5.5, Deutsch, Freundlich, notice not accepted", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      mode: "openrouter",
      model: "anthropic/claude-haiku-5.5",
      navModel: "microsoft/microsoft-decision-1",
      thinking: false,
      photoMaxEdge: 1280,
      language: "de",
      tone: "freundlich",
      noticeAccepted: false,
    });
  });

  it("only allows Haiku and Jev; anything else falls back to the default", () => {
    expect(mergeSettings({ model: "qwen/qwen3.7-flash", navModel: "anthropic/claude-haiku-5.5" }, {})).toMatchObject({
      model: "qwen/qwen3.7-flash",
      navModel: "anthropic/claude-haiku-5.5",
    });
    expect(mergeSettings({ model: "qwen/qwen3.7-flash" }, {}).model).toBe("qwen/qwen3.7-flash");
    // Removed models (owner's choice) fall back to the defaults.
    expect(mergeSettings({ model: "deepseek/deepseek-v4.1-flash" as never }, {}).model).toBe("anthropic/claude-haiku-5.5");
    expect(mergeSettings({ model: "typesafe/jev-router" as never, navModel: "typesafe/jev-router" as never }, {})).toMatchObject({
      model: "anthropic/claude-haiku-5.5",
      navModel: "microsoft/microsoft-decision-1",
    });
    expect(mergeSettings({ model: "openai/gpt-5-nano" as never }, {}).model).toBe("anthropic/claude-haiku-5.5");
    expect(mergeSettings({ mode: "direct" as never, apiKey: "k" }, {})).toMatchObject({ mode: "openrouter", apiKey: "k" });
  });

  it("photo size for the AI is 1280 or 1024 px; anything else falls back to 1280", () => {
    expect(mergeSettings({ photoMaxEdge: 1024 }, {}).photoMaxEdge).toBe(1024);
    expect(mergeSettings({ photoMaxEdge: 640 as never }, {}).photoMaxEdge).toBe(1280);
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

  it("passes the own instruction into the style; the panel can override it per item", () => {
    const s = mergeSettings({ customPrompt: "  Erwähne: Nichtraucherhaushalt  " }, {});
    expect(styleFrom(s).customInstructions).toBe("Erwähne: Nichtraucherhaushalt");
    expect(styleFrom(s, { customPrompt: "Kurz halten" }).customInstructions).toBe("Kurz halten");
    expect(mergeSettings({ customPrompt: "x".repeat(401) }, {}).customPrompt).toBe("");
  });

  it("has no closing text any more", () => {
    expect(styleFrom(mergeSettings({}, {})).closingText).toBe("");
  });
});
