import { LANGUAGE_LABELS, LANGUAGES, TONE_LABELS, TONES, type Language, type Tone } from "@thrift/shared";
import type { Unresolved } from "../fill/fill";
import tailwindCss from "./tailwind.css?inline";

/**
 * Tailwind build (Atelier theme, src/ui/tailwind.css), injected into the panel's shadow root so
 * it neither leaks into nor inherits from vinted.de.
 */
const SHADOW_CSS = `${tailwindCss}\n:host { all: initial; }`;

/** Browsers ignore @property inside shadow roots; register Tailwind's --tw-* properties on the page once. */
function registerProperties(doc: Document) {
  if (doc.querySelector("style[data-thrift-props]")) return;
  const rules = tailwindCss.match(/@property\s+--tw-[\w-]+\s*\{[^}]*\}/g);
  if (!rules) return;
  const style = doc.createElement("style");
  style.setAttribute("data-thrift-props", "");
  style.textContent = rules.join("\n");
  doc.head.append(style);
}

export interface PanelHandlers {
  onFill(): void;
  onRewrite(): void;
  onStyleChange(language: Language, tone: Tone): void;
  onAcceptNotice(): void;
}

export interface Panel {
  host: HTMLElement;
  setEnabled(enabled: boolean, hint?: string): void;
  setBusy(busy: boolean): void;
  setStatus(msg: string, error?: boolean): void;
  setStyle(language: Language, tone: Tone): void;
  showNotice(show: boolean): void;
  showResult(unresolved: Unresolved[], canRewrite: boolean): void;
  setCost(text: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createPanel(doc: Document, h: PanelHandlers): Panel {
  const host = doc.createElement("div");
  host.setAttribute("data-thrift-ui", "");
  const root = host.attachShadow({ mode: "open" });
  root.append(el("style", {}, SHADOW_CSS));
  registerProperties(doc);

  const card = el("div", {
    class:
      "fixed right-3 bottom-[84px] z-[2147483646] w-[min(340px,calc(100vw-24px))] rounded-[22px] border border-white/70 " +
      "bg-paper/95 p-3 font-sans text-[15px] leading-snug text-ink antialiased backdrop-blur-xl backdrop-saturate-150 " +
      "shadow-[0_12px_34px_rgba(28,27,25,0.18),inset_0_1px_0_rgba(255,255,255,0.9)]",
    role: "region",
    "aria-label": "Thrift",
  });
  const head = el("div", { class: "flex items-center gap-2" });
  head.append(el("div", { class: "eyebrow flex-1" }, "Thrift"));
  const min = el(
    "button",
    { class: "cursor-pointer border-0 bg-transparent px-1.5 py-1 text-lg leading-none text-muted", "aria-label": "Minimieren" },
    "–",
  );
  head.append(min);

  const body = el("div");
  const selectCls = "h-9 flex-1 rounded-xl border border-line bg-white px-2 text-sm text-ink outline-none focus:border-spruce";
  const styleRow = el("div", { class: "mt-2 flex items-center gap-2" });
  const lang = el("select", { class: selectCls, "aria-label": "Sprache" });
  for (const l of LANGUAGES) lang.append(el("option", { value: l }, LANGUAGE_LABELS[l]));
  const tone = el("select", { class: selectCls, "aria-label": "Ton" });
  for (const t of TONES) tone.append(el("option", { value: t }, TONE_LABELS[t]));
  styleRow.append(lang, tone);

  const actions = el("div", { class: "mt-2 flex items-center gap-2" });
  const fill = el("button", { class: "btn-primary h-[46px] flex-1", "data-testid": "thrift-fill" }, "✨ Ausfüllen");
  const rewrite = el("button", { class: "btn-ghost hidden shrink-0", "data-testid": "thrift-rewrite" }, "Neu schreiben");
  actions.append(fill, rewrite);

  const status = el("div", { class: "mt-2 min-h-[18px] text-[13px] text-muted", role: "status", "aria-live": "polite" });
  const list = el("div", { class: "mt-2 flex flex-col gap-1.5" });
  const notice = el("div", { class: "card mt-2 hidden space-y-2 rounded-[14px] p-3 text-[13px]", "data-testid": "thrift-notice" });
  notice.append(
    el("p", {}, "Thrift füllt das Vinted-Formular in deinem eigenen Browser aus. Den Button „Hochladen“ klickst immer du selbst."),
    el("p", {}, "Hinweis: Vinteds Nutzungsbedingungen schränken externe Tools ein. Thrift handelt nur nach deinem Klick und sendet nichts ab."),
  );
  const ok = el("button", { class: "btn-primary", "data-testid": "thrift-notice-ok" }, "Verstanden");
  notice.append(ok);
  const foot = el("div", { class: "mt-1.5 text-right text-[11px] text-muted" });

  body.append(styleRow, actions, notice, status, list, foot);
  card.append(head, body);
  root.append(card);
  doc.body.append(host);

  fill.addEventListener("click", () => h.onFill());
  rewrite.addEventListener("click", () => h.onRewrite());
  ok.addEventListener("click", () => h.onAcceptNotice());
  const styleChanged = () => h.onStyleChange(lang.value as Language, tone.value as Tone);
  lang.addEventListener("change", styleChanged);
  tone.addEventListener("change", styleChanged);
  min.addEventListener("click", () => {
    const hidden = body.classList.toggle("hidden");
    min.textContent = hidden ? "+" : "–";
  });

  return {
    host,
    setEnabled(enabled, hint) {
      fill.disabled = !enabled;
      if (!enabled && hint) status.textContent = hint;
    },
    setBusy(busy) {
      fill.disabled = busy;
      rewrite.disabled = busy;
      fill.textContent = busy ? "Arbeite …" : "✨ Ausfüllen";
    },
    setStatus(msg, error = false) {
      status.textContent = msg;
      status.classList.toggle("text-danger", error);
      status.classList.toggle("text-muted", !error);
    },
    setStyle(l, t) {
      lang.value = l;
      tone.value = t;
    },
    showNotice(show) {
      notice.classList.toggle("hidden", !show);
    },
    showResult(unresolved, canRewrite) {
      rewrite.classList.toggle("hidden", !canRewrite);
      list.replaceChildren();
      for (const u of unresolved) {
        const item = el("div", { class: "flex items-center gap-2 rounded-xl bg-white px-2.5 py-2" });
        const txt = el("div", { class: "truncate text-[13px]", title: u.value }, u.value);
        const k = el("div", { class: "text-xs text-muted" }, u.label);
        const copy = el("button", { class: "btn-ghost shrink-0", "data-testid": `thrift-copy-${u.key}` }, "Kopieren");
        copy.addEventListener("click", async () => {
          await navigator.clipboard?.writeText(u.value).catch(() => {});
          copy.textContent = "Kopiert ✓";
        });
        const col = el("div", { class: "min-w-0 flex-1" });
        col.append(k, txt);
        item.append(col, copy);
        list.append(item);
      }
    },
    setCost(text) {
      foot.textContent = text;
    },
  };
}
