import { DEFAULT_FORM_MAP } from "@thrift/shared";
import { norm, textOf } from "./core";

/**
 * "Only a human publishes" (spec: vinted-form-autofill). Every click the extension makes, and every
 * element the AI (Jev) may pick, goes through `isForbidden`. A remote form map can add words but never
 * remove these built-in ones.
 */
export const ALWAYS_FORBIDDEN: readonly string[] = [
  ...DEFAULT_FORM_MAP.forbiddenClickText,
  "posten",
  "inserieren",
  "einstellen",
  "verkaufen starten",
  "absenden",
  "senden",
  "send",
  "post item",
  "list item",
];

export function forbiddenWords(mapWords: readonly string[] = []): string[] {
  return [...new Set([...ALWAYS_FORBIDDEN, ...mapWords].map(norm).filter(Boolean))];
}

const CONTROL = "button, input, a, [role=button], [role=link], [role=menuitem], label, summary";

function hasWord(haystack: string, words: string[]): string | null {
  const h = norm(haystack);
  if (!h) return null;
  for (const w of words) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, "u").test(h)) return w;
  }
  return null;
}

/**
 * True for anything that could publish, save, delete or leave the page. `allowLinks` is only used for
 * options inside an open picker (Vinted renders brands as links): the click then has its navigation
 * suppressed (see humanClick), so the page is never left; the word check still applies.
 */
export function forbiddenReason(el: Element, mapWords: readonly string[] = [], opts: { allowLinks?: boolean } = {}): string | null {
  const words = forbiddenWords(mapWords);
  const control = (el.closest(CONTROL) ?? el) as HTMLElement;
  for (const node of new Set([el as HTMLElement, control])) {
    const type = (node.getAttribute("type") ?? "").toLowerCase();
    if ((node.tagName === "BUTTON" || node.tagName === "INPUT") && (type === "submit" || type === "image")) {
      return "submit control";
    }
    if (node.tagName === "A" && !opts.allowLinks) {
      const href = node.getAttribute("href") ?? "";
      if (href && !href.startsWith("#") && !href.startsWith("javascript:")) return "link leaves the page";
    }
    const testid = (node.getAttribute("data-testid") ?? "").replace(/[-_]+/g, " ");
    const texts = [
      textOf(node),
      node.getAttribute("aria-label"),
      node.getAttribute("title"),
      (node as HTMLInputElement).value && node.tagName === "INPUT" ? (node as HTMLInputElement).value : "",
      testid,
    ];
    for (const t of texts) {
      const w = hasWord(t ?? "", words);
      if (w) return `forbidden word: ${w}`;
    }
  }
  return null;
}

export function isForbidden(el: Element, mapWords: readonly string[] = [], opts: { allowLinks?: boolean } = {}): boolean {
  return forbiddenReason(el, mapWords, opts) !== null;
}

/**
 * While the extension fills, nothing can submit the form, and scripted (untrusted) clicks on
 * publish-like controls are swallowed. A real human click (isTrusted) is never blocked after the fill.
 * Returns a release function.
 */
export function lockSubmission(doc: Document, mapWords: readonly string[] = []): () => void {
  const win = doc.defaultView;
  if (!win) return () => {};
  const block = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const onSubmit = (e: Event) => block(e);
  const onClick = (e: Event) => {
    const t = e.target;
    // Links are handled by humanClick (navigation suppressed); here only publish-like controls.
    if (!e.isTrusted && t instanceof Element && isForbidden(t, mapWords, { allowLinks: true })) block(e);
  };
  const onKey = (e: KeyboardEvent) => {
    if (!e.isTrusted && e.key === "Enter") block(e);
  };
  win.addEventListener("submit", onSubmit, true);
  win.addEventListener("click", onClick, true);
  win.addEventListener("keydown", onKey, true);
  return () => {
    win.removeEventListener("submit", onSubmit, true);
    win.removeEventListener("click", onClick, true);
    win.removeEventListener("keydown", onKey, true);
  };
}
