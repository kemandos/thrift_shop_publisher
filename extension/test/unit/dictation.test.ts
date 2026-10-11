import { dictatedText, dictationError, speechRecognition } from "@/src/ui/dictation";

const results = (...parts: string[]) => Object.assign(parts.map((t) => Object.assign([{ transcript: t }], { isFinal: true })), {});

describe("dictation", () => {
  it("appends what was said to the typed instruction", () => {
    expect(dictatedText("Kaum getragen.", results("Länge", " betonen"), 400)).toBe("Kaum getragen. Länge betonen");
    expect(dictatedText("", results("  nur  einmal getragen "), 400)).toBe("nur einmal getragen");
    expect(dictatedText("abc", results(), 400)).toBe("abc");
    expect(dictatedText("", results("x".repeat(500)), 400)).toHaveLength(400);
  });

  it("finds the browser's speech recognition, or none", () => {
    class Rec {}
    expect(speechRecognition({ webkitSpeechRecognition: Rec } as never)).toBe(Rec);
    expect(speechRecognition({} as never)).toBeNull();
  });

  it("explains a blocked microphone", () => {
    expect(dictationError("not-allowed")).toMatch(/Mikrofon/);
  });
});
