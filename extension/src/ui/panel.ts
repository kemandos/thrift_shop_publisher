import { LANGUAGE_LABELS, LANGUAGES, TONE_LABELS, TONES, type Language, type Tone } from "@thrift/shared";
import type { Unresolved } from "../fill/fill";

/** Atelier palette (see design D7b). */
const CSS = `
:host { all: initial; }
.card { position: fixed; right: 12px; bottom: 84px; z-index: 2147483646; width: min(340px, calc(100vw - 24px));
  box-sizing: border-box; background: rgba(247,245,241,0.94); -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%); border: 1px solid rgba(255,255,255,0.7); border-radius: 22px;
  box-shadow: 0 12px 34px rgba(28,27,25,0.18), inset 0 1px 0 rgba(255,255,255,0.9);
  font: 15px/1.35 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif; color: #1C1B19; padding: 12px; }
.row { display: flex; gap: 8px; align-items: center; }
.brand { font: 600 11px/1 -apple-system, system-ui, sans-serif; letter-spacing: 1.2px; color: #8A857D; text-transform: uppercase; flex: 1; }
.min { border: none; background: transparent; color: #8A857D; font-size: 18px; cursor: pointer; padding: 4px 6px; }
button.primary { flex: 1; height: 46px; border: none; border-radius: 23px; background: #3E4A43; color: #F7F5F1;
  font: 600 16px/1 -apple-system, system-ui, sans-serif; cursor: pointer; box-shadow: inset 0 1px 0 rgba(255,255,255,0.25); }
button.primary:disabled { background: #C9C4BC; cursor: default; }
button.ghost { height: 36px; border-radius: 18px; border: 1px solid #E3DFD8; background: #fff; color: #1C1B19; padding: 0 12px;
  font: 500 14px/1 -apple-system, system-ui, sans-serif; cursor: pointer; }
select { height: 36px; border-radius: 12px; border: 1px solid #E3DFD8; background: #fff; color: #1C1B19; padding: 0 8px;
  font: 14px -apple-system, system-ui, sans-serif; flex: 1; }
.status { margin-top: 8px; font-size: 13px; color: #6F6A63; min-height: 18px; }
.status.err { color: #8A2B2B; }
.list { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.item { display: flex; gap: 8px; align-items: center; background: #fff; border-radius: 12px; padding: 8px 10px; }
.item .k { font-size: 12px; color: #8A857D; }
.item .v { font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notice { margin-top: 8px; background: #fff; border-radius: 14px; padding: 12px; font-size: 13px; }
.notice p { margin: 0 0 8px; }
.hidden { display: none !important; }
.foot { margin-top: 6px; font-size: 11px; color: #8A857D; text-align: right; }
`;

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
  root.append(el("style", {}, CSS));

  const card = el("div", { class: "card", role: "region", "aria-label": "Thrift" });
  const head = el("div", { class: "row" });
  head.append(el("div", { class: "brand" }, "Thrift"));
  const min = el("button", { class: "min", "aria-label": "Minimieren" }, "–");
  head.append(min);

  const body = el("div");
  const styleRow = el("div", { class: "row" });
  styleRow.style.marginTop = "8px";
  const lang = el("select", { "aria-label": "Sprache" });
  for (const l of LANGUAGES) lang.append(el("option", { value: l }, LANGUAGE_LABELS[l]));
  const tone = el("select", { "aria-label": "Ton" });
  for (const t of TONES) tone.append(el("option", { value: t }, TONE_LABELS[t]));
  styleRow.append(lang, tone);

  const actions = el("div", { class: "row" });
  actions.style.marginTop = "8px";
  const fill = el("button", { class: "primary", "data-testid": "thrift-fill" }, "✨ Ausfüllen");
  const rewrite = el("button", { class: "ghost hidden", "data-testid": "thrift-rewrite" }, "Neu schreiben");
  actions.append(fill, rewrite);

  const status = el("div", { class: "status", role: "status", "aria-live": "polite" });
  const list = el("div", { class: "list" });
  const notice = el("div", { class: "notice hidden", "data-testid": "thrift-notice" });
  notice.append(
    el("p", {}, "Thrift füllt das Vinted-Formular in deinem eigenen Browser aus. Den Button „Hochladen“ klickst immer du selbst."),
    el("p", {}, "Hinweis: Vinteds Nutzungsbedingungen schränken externe Tools ein. Thrift handelt nur nach deinem Klick und sendet nichts ab."),
  );
  const ok = el("button", { class: "primary", "data-testid": "thrift-notice-ok" }, "Verstanden");
  notice.append(ok);
  const foot = el("div", { class: "foot" });

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
      status.classList.toggle("err", error);
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
        const item = el("div", { class: "item" });
        const txt = el("div", { class: "v", title: u.value }, u.value);
        const k = el("div", { class: "k" }, u.label);
        const copy = el("button", { class: "ghost", "data-testid": `thrift-copy-${u.key}` }, "Kopieren");
        copy.addEventListener("click", async () => {
          await navigator.clipboard?.writeText(u.value).catch(() => {});
          copy.textContent = "Kopiert ✓";
        });
        const col = el("div");
        col.style.flex = "1";
        col.style.minWidth = "0";
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
