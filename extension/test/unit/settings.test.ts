import { fakeBrowser } from "wxt/testing/fake-browser";
import { DEFAULT_SETTINGS, loadLocalSettings, maskSecret, mergeSettings, saveSettings, styleFrom } from "@/src/settings";

describe("settings", () => {
  beforeEach(() => fakeBrowser.reset());

  it("defaults to direct mode, Deutsch, Freundlich, notice not accepted", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ mode: "direct", language: "de", tone: "freundlich", noticeAccepted: false });
  });

  it("native (iPhone app) values win over empty local values", () => {
    const s = mergeSettings({ apiKey: "", language: "de" }, { apiKey: "sk-ant-native", language: "en" });
    expect(s.apiKey).toBe("sk-ant-native");
    expect(s.language).toBe("en");
  });

  it("rejects unsupported languages by falling back to defaults", () => {
    const s = mergeSettings({ language: "fr" as never }, {});
    expect(s.language).toBe("de");
  });

  it("persists only locally and round-trips", async () => {
    await saveSettings({ apiKey: "sk-ant-123456", tone: "locker" });
    const local = await loadLocalSettings();
    expect(local.apiKey).toBe("sk-ant-123456");
    expect(local.tone).toBe("locker");
  });

  it("masks secrets to the last 4 characters", () => {
    expect(maskSecret("sk-ant-abcdef3fA9")).toBe("••••••••3fA9");
    expect(maskSecret("")).toBe("");
  });

  it("uses the closing text of the chosen language", () => {
    const s = mergeSettings({ closingTextDe: "Versand in 2 Tagen.", closingTextEn: "Ships in 2 days." }, {});
    expect(styleFrom(s).closingText).toBe("Versand in 2 Tagen.");
    expect(styleFrom(s, { language: "en" }).closingText).toBe("Ships in 2 days.");
  });
});
