/**
 * Dictation for the own instruction (Web Speech API). Chrome sends the audio to Google's speech
 * service and asks once for microphone access on vinted.de; Safari uses Apple's. Where the API is
 * missing the button stays hidden and the keyboard's own dictation key still works.
 */

interface SpeechResultList {
  readonly length: number;
  [i: number]: { readonly isFinal: boolean; [j: number]: { readonly transcript: string } };
}

export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: SpeechResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export type RecognitionCtor = new () => Recognition;

export function speechRecognition(win: Window | null | undefined): RecognitionCtor | null {
  const w = win as (Window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }) | null | undefined;
  return w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null;
}

/** Everything recognised since the start, appended to what was already typed. */
export function dictatedText(before: string, results: SpeechResultList, max: number): string {
  let spoken = "";
  for (let i = 0; i < results.length; i++) spoken += results[i]![0]!.transcript;
  spoken = spoken.replace(/\s+/g, " ").trim();
  const head = before.trim();
  return (head && spoken ? `${head} ${spoken}` : head || spoken).slice(0, max);
}

export function dictationError(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") return "Mikrofon nicht erlaubt – im Browser für vinted.de freigeben";
  if (error === "no-speech") return "Nichts gehört – bitte nochmal";
  if (error === "network") return "Diktieren braucht eine Internetverbindung";
  return "Diktieren hat nicht geklappt";
}
