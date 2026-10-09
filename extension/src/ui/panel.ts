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

export type Dock = "bottom" | "top";

export interface PanelLayout {
  dock: Dock;
  collapsed: boolean;
}

export interface PanelHandlers {
  onFill(): void;
  onRewrite(): void;
  onStyleChange(language: Language, tone: Tone): void;
  /** The seller's own instruction for this item (wording only). */
  onInstructionsChange?(text: string): void;
  onAcceptNotice(): void;
  /** Called when the user moves or collapses the panel (persisted by the caller). */
  onLayoutChange?(layout: PanelLayout): void;
}

export interface Panel {
  host: HTMLElement;
  setEnabled(enabled: boolean, hint?: string): void;
  setBusy(busy: boolean): void;
  setStatus(msg: string, error?: boolean): void;
  setStyle(language: Language, tone: Tone): void;
  setInstructions(text: string): void;
  setLayout(layout: Partial<PanelLayout>): void;
  showNotice(show: boolean): void;
  showResult(unresolved: Unresolved[], canRewrite: boolean): void;
  setCost(text: string): void;
  /** OpenRouter balance line; `low` shows it as a warning. Empty text hides it. */
  setBalance(text: string, low?: boolean): void;
  /** Fill log offered via "Protokoll kopieren" (empty hides the button). */
  setLog(text: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * The on-screen keyboard is open when a page field has focus and the visual viewport shrank
 * (iPhone/iPad Safari). The panel then hides so it never covers the field being typed in.
 */
export function keyboardOpen(innerHeight: number, visualHeight: number | undefined, editingPageField: boolean): boolean {
  if (!editingPageField || visualHeight === undefined) return false;
  return innerHeight - visualHeight > 120;
}

function isEditable(node: Element | null): boolean {
  if (!node) return false;
  if (node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) return true;
  if (node instanceof HTMLInputElement) return !["button", "checkbox", "radio", "submit", "file", "image"].includes(node.type);
  return (node as HTMLElement).isContentEditable === true;
}

/*
 * Layout (viewport-based, so it follows the window on Mac and iPad split view / Stage Manager):
 * - < 640 px wide (iPhone portrait, narrow windows): full-width sheet, 8 px margin, above the safe area.
 * - ≥ 640 px (iPhone landscape, iPad, Mac): 360 px floating card at the right edge.
 * - Always: max height = viewport minus margin, content scrolls (landscape phones, short windows).
 * - Touch (pointer: coarse): 44 px targets and 16 px text (no iOS zoom on focus).
 * - Collapsed: a small pill with "✨ Ausfüllen" and expand; dock top/bottom in case it covers Vinted's own buttons.
 */
const CARD =
  "group fixed z-[2147483646] inset-x-2 bottom-[max(8px,env(safe-area-inset-bottom))] " +
  "data-[dock=top]:bottom-auto data-[dock=top]:top-[max(8px,env(safe-area-inset-top))] " +
  "sm:inset-x-auto sm:right-[max(16px,env(safe-area-inset-right))] sm:w-[360px] sm:bottom-[max(16px,env(safe-area-inset-bottom))] " +
  "sm:data-[dock=top]:top-[max(16px,env(safe-area-inset-top))] " +
  "data-[collapsed]:left-auto data-[collapsed]:w-auto sm:data-[collapsed]:w-auto " +
  "data-[keyboard]:hidden " +
  "max-h-[calc(100dvh-16px)] sm:max-h-[calc(100dvh-32px)] overflow-y-auto overscroll-contain " +
  "rounded-[22px] border border-white/70 bg-paper/95 p-3 font-sans text-[15px] leading-snug text-ink antialiased " +
  "backdrop-blur-xl backdrop-saturate-150 shadow-[0_12px_34px_rgba(28,27,25,0.18),inset_0_1px_0_rgba(255,255,255,0.9)] " +
  "[@media(max-height:480px)]:p-2";

const ICON_BTN =
  "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-lg leading-none " +
  "text-muted hover:bg-black/5 pointer-coarse:size-11";
const SELECT =
  "h-9 min-w-0 flex-1 rounded-xl border border-line bg-white px-2 text-sm text-ink outline-none focus:border-spruce " +
  "pointer-coarse:h-11 pointer-coarse:text-base";
const COARSE_BTN = "pointer-coarse:h-11 pointer-coarse:text-base";

export function createPanel(doc: Document, h: PanelHandlers): Panel {
  const host = doc.createElement("div");
  host.setAttribute("data-thrift-ui", "");
  const root = host.attachShadow({ mode: "open" });
  root.append(el("style", {}, SHADOW_CSS));
  registerProperties(doc);

  const card = el("div", { class: CARD, role: "region", "aria-label": "Thrift", "data-testid": "thrift-panel" });
  let layout: PanelLayout = { dock: "bottom", collapsed: false };

  // Header: brand, compact fill (collapsed only), move, collapse.
  const head = el("div", { class: "flex items-center gap-1" });
  const brand = el("div", { class: "eyebrow flex-1 pl-1 group-data-[collapsed]:hidden" }, "Thrift");
  const fillCompact = el(
    "button",
    {
      class: `btn-primary hidden h-9 w-auto px-4 text-sm group-data-[collapsed]:flex ${COARSE_BTN}`,
      "data-testid": "thrift-fill-compact",
    },
    "✨ Ausfüllen",
  );
  const dockBtn = el("button", { class: `${ICON_BTN} group-data-[collapsed]:hidden`, "data-testid": "thrift-dock" });
  const collapseBtn = el("button", { class: ICON_BTN, "data-testid": "thrift-collapse" });
  head.append(brand, fillCompact, dockBtn, collapseBtn);

  const body = el("div", { class: "group-data-[collapsed]:hidden" });
  const styleRow = el("div", { class: "mt-2 flex items-center gap-2" });
  const lang = el("select", { class: SELECT, "aria-label": "Sprache" });
  for (const l of LANGUAGES) lang.append(el("option", { value: l }, LANGUAGE_LABELS[l]));
  const tone = el("select", { class: SELECT, "aria-label": "Ton" });
  for (const t of TONES) tone.append(el("option", { value: t }, TONE_LABELS[t]));
  styleRow.append(lang, tone);

  // Own instruction (in addition to the tone), collapsible so the panel stays small.
  const instrToggle = el(
    "button",
    {
      class: "mt-1.5 cursor-pointer border-0 bg-transparent p-0 text-[12px] text-spruce underline pointer-coarse:py-2 pointer-coarse:text-sm",
      "data-testid": "thrift-instructions-toggle",
      "aria-expanded": "false",
    },
    "Eigene Anweisung",
  );
  const instr = el("textarea", {
    class:
      "field mt-1.5 hidden min-h-[64px] resize-y text-[13px] pointer-coarse:text-base",
    rows: "2",
    maxlength: "400",
    placeholder: "z. B. Erwähne: Nichtraucherhaushalt. Kurze Sätze.",
    "aria-label": "Eigene Anweisung für Titel und Beschreibung",
    "data-testid": "thrift-instructions",
  });
  const instrHint = el(
    "div",
    { class: "mt-1 hidden text-[11px] text-muted pointer-coarse:text-xs" },
    "Nur für den Text zum Kleidungsstück. Andere Aufgaben werden ignoriert.",
  );
  const setInstrOpen = (open: boolean) => {
    instr.classList.toggle("hidden", !open);
    instrHint.classList.toggle("hidden", !open);
    instrToggle.setAttribute("aria-expanded", String(open));
  };
  const markInstr = () => {
    instrToggle.textContent = instr.value.trim() ? "Eigene Anweisung ✓" : "Eigene Anweisung";
  };
  instrToggle.addEventListener("click", () => setInstrOpen(instr.classList.contains("hidden")));
  instr.addEventListener("input", () => {
    markInstr();
    h.onInstructionsChange?.(instr.value);
  });

  const actions = el("div", { class: "mt-2 flex items-center gap-2" });
  const fill = el("button", { class: "btn-primary h-[46px] flex-1 pointer-coarse:h-12", "data-testid": "thrift-fill" }, "✨ Ausfüllen");
  const rewrite = el("button", { class: `btn-ghost hidden shrink-0 ${COARSE_BTN}`, "data-testid": "thrift-rewrite" }, "Neu schreiben");
  actions.append(fill, rewrite);

  const status = el("div", { class: "mt-2 min-h-[18px] text-[13px] text-muted pointer-coarse:text-sm", role: "status", "aria-live": "polite" });
  const list = el("div", { class: "mt-2 flex flex-col gap-1.5" });
  const notice = el("div", { class: "card mt-2 hidden space-y-2 rounded-[14px] p-3 text-[13px] pointer-coarse:text-sm", "data-testid": "thrift-notice" });
  notice.append(
    el("p", {}, "Thrift füllt das Vinted-Formular in deinem eigenen Browser aus. Den Button „Hochladen“ klickst immer du selbst."),
    el("p", {}, "Hinweis: Vinteds Nutzungsbedingungen schränken externe Tools ein. Thrift handelt nur nach deinem Klick und sendet nichts ab."),
  );
  const ok = el("button", { class: "btn-primary", "data-testid": "thrift-notice-ok" }, "Verstanden");
  notice.append(ok);
  const foot = el("div", { class: "mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted pointer-coarse:text-xs" });
  const logBtn = el(
    "button",
    { class: "hidden cursor-pointer border-0 bg-transparent p-0 text-[11px] text-spruce underline pointer-coarse:py-2 pointer-coarse:text-xs", "data-testid": "thrift-log" },
    "Protokoll kopieren",
  );
  const footText = el("div", { class: "ml-auto text-right" });
  const cost = el("div", {});
  const balance = el("div", { "data-testid": "thrift-balance" });
  footText.append(cost, balance);
  foot.append(logBtn, footText);
  let logText = "";
  logBtn.addEventListener("click", async () => {
    await navigator.clipboard?.writeText(logText).catch(() => {});
    logBtn.textContent = "Kopiert ✓";
    setTimeout(() => (logBtn.textContent = "Protokoll kopieren"), 2000);
  });

  body.append(styleRow, instrToggle, instr, instrHint, actions, notice, status, list, foot);
  card.append(head, body);
  root.append(card);
  doc.body.append(host);

  const applyLayout = () => {
    card.setAttribute("data-dock", layout.dock);
    card.toggleAttribute("data-collapsed", layout.collapsed);
    dockBtn.textContent = layout.dock === "bottom" ? "↑" : "↓";
    dockBtn.setAttribute("aria-label", layout.dock === "bottom" ? "Nach oben verschieben" : "Nach unten verschieben");
    collapseBtn.textContent = layout.collapsed ? "+" : "–";
    collapseBtn.setAttribute("aria-label", layout.collapsed ? "Aufklappen" : "Minimieren");
  };
  const changeLayout = (patch: Partial<PanelLayout>) => {
    layout = { ...layout, ...patch };
    applyLayout();
    h.onLayoutChange?.(layout);
  };
  const expand = () => {
    if (layout.collapsed) changeLayout({ collapsed: false });
  };
  applyLayout();

  // Hide while the on-screen keyboard is up (iPhone/iPad), so the field being typed in stays visible.
  const win = doc.defaultView;
  const updateKeyboard = () => {
    const active = doc.activeElement;
    const editingPage = isEditable(active) && !(active instanceof Element && active.closest("[data-thrift-ui]"));
    card.toggleAttribute("data-keyboard", keyboardOpen(win?.innerHeight ?? 0, win?.visualViewport?.height, editingPage));
  };
  win?.visualViewport?.addEventListener("resize", updateKeyboard);
  doc.addEventListener("focusin", updateKeyboard);
  doc.addEventListener("focusout", () => setTimeout(updateKeyboard, 50));

  fill.addEventListener("click", () => h.onFill());
  fillCompact.addEventListener("click", () => h.onFill());
  rewrite.addEventListener("click", () => h.onRewrite());
  ok.addEventListener("click", () => h.onAcceptNotice());
  const styleChanged = () => h.onStyleChange(lang.value as Language, tone.value as Tone);
  lang.addEventListener("change", styleChanged);
  tone.addEventListener("change", styleChanged);
  collapseBtn.addEventListener("click", () => changeLayout({ collapsed: !layout.collapsed }));
  dockBtn.addEventListener("click", () => changeLayout({ dock: layout.dock === "bottom" ? "top" : "bottom" }));

  return {
    host,
    setEnabled(enabled, hint) {
      fill.disabled = !enabled;
      fillCompact.disabled = !enabled;
      if (!enabled && hint) status.textContent = hint;
    },
    setBusy(busy) {
      fill.disabled = busy;
      fillCompact.disabled = busy;
      rewrite.disabled = busy;
      fill.textContent = busy ? "Arbeite …" : "✨ Ausfüllen";
      fillCompact.textContent = busy ? "Arbeite …" : "✨ Ausfüllen";
    },
    setStatus(msg, error = false) {
      status.textContent = msg;
      status.classList.toggle("text-danger", error);
      status.classList.toggle("text-muted", !error);
      if (error) expand();
    },
    setStyle(l, t) {
      lang.value = l;
      tone.value = t;
    },
    setInstructions(text) {
      instr.value = text;
      markInstr();
    },
    setLayout(patch) {
      layout = { ...layout, ...patch };
      applyLayout();
    },
    showNotice(show) {
      notice.classList.toggle("hidden", !show);
      if (show) expand();
    },
    showResult(unresolved, canRewrite) {
      rewrite.classList.toggle("hidden", !canRewrite);
      list.replaceChildren();
      for (const u of unresolved) {
        const item = el("div", { class: "flex items-center gap-2 rounded-xl bg-white px-2.5 py-2" });
        const txt = el("div", { class: "truncate text-[13px] pointer-coarse:text-sm", title: u.value }, u.value);
        const k = el("div", { class: "text-xs text-muted" }, u.label);
        const copy = el("button", { class: `btn-ghost shrink-0 ${COARSE_BTN}`, "data-testid": `thrift-copy-${u.key}` }, "Kopieren");
        copy.addEventListener("click", async () => {
          await navigator.clipboard?.writeText(u.value).catch(() => {});
          copy.textContent = "Kopiert ✓";
        });
        const col = el("div", { class: "min-w-0 flex-1" });
        col.append(k, txt);
        item.append(col, copy);
        list.append(item);
      }
      if (unresolved.length) expand();
    },
    setCost(text) {
      cost.textContent = text;
    },
    setBalance(text, low = false) {
      balance.textContent = text;
      balance.classList.toggle("text-danger", low);
    },
    setLog(text) {
      logText = text;
      logBtn.classList.toggle("hidden", !text);
    },
  };
}
