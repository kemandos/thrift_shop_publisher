import { LANGUAGE_LABELS, LANGUAGES, TONE_LABELS, TONES, type Language, type Tone } from "@thrift/shared";
import { bg } from "@/src/client";
import { loadLocalSettings, maskSecret, mergeSettings, saveSettings, type Settings } from "@/src/settings";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let current: Settings;

function radioList<T extends string>(container: HTMLElement, name: string, values: readonly T[], labels: Record<T, string>, selected: T) {
  container.replaceChildren();
  for (const v of values) {
    const label = document.createElement("label");
    label.className = "radio";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = v;
    input.checked = v === selected;
    label.append(input, ` ${labels[v]}`);
    container.append(label);
  }
}

function showMode(mode: Settings["mode"]) {
  $("direct").classList.toggle("hidden", mode !== "direct");
  $("server").classList.toggle("hidden", mode !== "server");
}

function render(s: Settings) {
  current = s;
  for (const r of document.querySelectorAll<HTMLInputElement>("input[name=mode]")) r.checked = r.value === s.mode;
  showMode(s.mode);
  $<HTMLInputElement>("apiKey").value = "";
  $("apiKeyMasked").textContent = s.apiKey ? `Gespeichert: ${maskSecret(s.apiKey)}` : "";
  $<HTMLInputElement>("serverUrl").value = s.serverUrl;
  $<HTMLInputElement>("serverToken").value = "";
  $("serverTokenMasked").textContent = s.serverToken ? `Gespeichert: ${maskSecret(s.serverToken)}` : "";
  radioList($("languages"), "language", LANGUAGES, LANGUAGE_LABELS, s.language);
  radioList($("tones"), "tone", TONES, TONE_LABELS, s.tone);
  $<HTMLTextAreaElement>("closingTextDe").value = s.closingTextDe;
  $<HTMLTextAreaElement>("closingTextEn").value = s.closingTextEn;
}

function checked(name: string): string {
  return document.querySelector<HTMLInputElement>(`input[name=${name}]:checked`)?.value ?? "";
}

async function save(): Promise<Settings> {
  const key = $<HTMLInputElement>("apiKey").value.trim();
  const token = $<HTMLInputElement>("serverToken").value.trim();
  const s = await saveSettings({
    mode: (checked("mode") || "direct") as Settings["mode"],
    apiKey: key || current.apiKey,
    serverUrl: $<HTMLInputElement>("serverUrl").value.trim(),
    serverToken: token || current.serverToken,
    language: (checked("language") || "de") as Language,
    tone: (checked("tone") || "freundlich") as Tone,
    closingTextDe: $<HTMLTextAreaElement>("closingTextDe").value,
    closingTextEn: $<HTMLTextAreaElement>("closingTextEn").value,
  });
  render(s);
  return s;
}

document.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.name === "mode") showMode(t.value as Settings["mode"]);
});
$("save").addEventListener("click", async () => {
  await save();
  $("saved").textContent = "Gespeichert ✓";
});
$("test").addEventListener("click", async () => {
  await save();
  $("testResult").textContent = "Teste …";
  try {
    await bg.get("testConnection");
    $("testResult").textContent = "Verbindung funktioniert ✓";
  } catch (e) {
    $("testResult").textContent = `Fehler: ${e instanceof Error ? e.message : String(e)}`;
  }
});

void loadLocalSettings().then((l) => render(mergeSettings(l, {})));
