import { LANGUAGE_LABELS, LANGUAGES, NAV_MODELS, TEXT_MODELS, TONE_LABELS, TONES, type Language, type Tone } from "@thrift/shared";
import { bg } from "@/src/client";
import { loadLocalSettings, maskSecret, mergeSettings, saveSettings, type Settings } from "@/src/settings";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let current: Settings;

function radioList<T extends string>(container: HTMLElement, name: string, values: readonly T[], labels: Record<T, string>, selected: T) {
  container.replaceChildren();
  for (const v of values) {
    const label = document.createElement("label");
    label.className = "radio-row";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = v;
    input.checked = v === selected;
    label.append(input, ` ${labels[v]}`);
    container.append(label);
  }
}

type ModelId = Settings["model"];
type NavModelId = Settings["navModel"];

const PHOTO_SIZES = [
  { id: "1280", label: "1280 px", note: "Standard · Etiketten am besten lesbar" },
  { id: "1024", label: "1024 px", note: "schneller, günstiger" },
];

function renderModels(
  containerId: string,
  name: string,
  selected: string,
  models: ReadonlyArray<{ id: string; label: string; note: string }>,
) {
  const box = $(containerId);
  box.replaceChildren();
  for (const m of models) {
    const label = document.createElement("label");
    label.className = "radio-row";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = m.id;
    input.checked = m.id === selected;
    const title = document.createElement("span");
    title.className = "flex-1";
    title.textContent = m.label;
    const note = document.createElement("span");
    note.className = "text-[13px] text-muted";
    note.textContent = m.note;
    label.append(input, title, note);
    box.append(label);
  }
}

function showMode(mode: Settings["mode"]) {
  $("openrouter").classList.toggle("hidden", mode !== "openrouter");
  $("server").classList.toggle("hidden", mode !== "server");
}

function render(s: Settings) {
  current = s;
  for (const r of document.querySelectorAll<HTMLInputElement>("input[name=mode]")) r.checked = r.value === s.mode;
  showMode(s.mode);
  $<HTMLInputElement>("apiKey").value = "";
  $("apiKeyMasked").textContent = s.apiKey ? `Gespeichert: ${maskSecret(s.apiKey)}` : "";
  renderModels("models", "model", s.model, TEXT_MODELS);
  $<HTMLInputElement>("thinking").checked = s.thinking;
  $<HTMLInputElement>("smokeFree").checked = s.smokeFree;
  $<HTMLInputElement>("petFree").checked = s.petFree;
  renderModels("navModels", "navModel", s.navModel, NAV_MODELS);
  renderModels("photoSizes", "photoMaxEdge", String(s.photoMaxEdge), PHOTO_SIZES);
  $<HTMLInputElement>("serverUrl").value = s.serverUrl;
  $<HTMLInputElement>("serverToken").value = "";
  $("serverTokenMasked").textContent = s.serverToken ? `Gespeichert: ${maskSecret(s.serverToken)}` : "";
  radioList($("languages"), "language", LANGUAGES, LANGUAGE_LABELS, s.language);
  radioList($("tones"), "tone", TONES, TONE_LABELS, s.tone);
}

function checked(name: string): string {
  return document.querySelector<HTMLInputElement>(`input[name=${name}]:checked`)?.value ?? "";
}

async function save(): Promise<Settings> {
  const key = $<HTMLInputElement>("apiKey").value.trim();
  const token = $<HTMLInputElement>("serverToken").value.trim();
  const s = await saveSettings({
    mode: (checked("mode") || "openrouter") as Settings["mode"],
    apiKey: key || current.apiKey,
    model: (checked("model") || current.model) as ModelId,
    navModel: (checked("navModel") || current.navModel) as NavModelId,
    thinking: $<HTMLInputElement>("thinking").checked,
    smokeFree: $<HTMLInputElement>("smokeFree").checked,
    petFree: $<HTMLInputElement>("petFree").checked,
    photoMaxEdge: Number(checked("photoMaxEdge") || current.photoMaxEdge) as Settings["photoMaxEdge"],
    serverUrl: $<HTMLInputElement>("serverUrl").value.trim(),
    serverToken: token || current.serverToken,
    language: (checked("language") || "de") as Language,
    tone: (checked("tone") || "freundlich") as Tone,
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
