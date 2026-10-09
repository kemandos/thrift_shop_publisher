import type { PageElement } from "@thrift/shared";
import { isVisible, textOf } from "./core";
import { isForbidden } from "./guard";

const ATTR = "data-thrift-id";
const INTERACTIVE =
  "input:not([type=hidden]), textarea, select, button, a[href], [role=button], [role=combobox], [role=option], [role=textbox], [tabindex]:not([tabindex='-1'])";

function labelFor(el: Element): string {
  const aria = el.getAttribute("aria-label") ?? el.getAttribute("placeholder");
  if (aria) return aria;
  const id = el.getAttribute("id");
  if (id) {
    const l = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (l) return textOf(l);
  }
  // Nearest preceding short text in the parent chain.
  let p = el.parentElement;
  for (let d = 0; p && d < 3; d++, p = p.parentElement) {
    const t = Array.from(p.children)
      .filter((c) => c !== el && !c.contains(el))
      .map((c) => textOf(c))
      .find((t) => t && t.length < 40);
    if (t) return t;
  }
  return "";
}

/** Compact list of visible interactive elements for AI element picking (Jev-style fallback). */
export function snapshotElements(doc: Document, forbidden: readonly string[], max = 150): PageElement[] {
  const out: PageElement[] = [];
  let i = 0;
  for (const el of Array.from(doc.querySelectorAll(INTERACTIVE))) {
    if (out.length >= max) break;
    if (!isVisible(el) || el.closest("[data-thrift-ui]")) continue;
    // Jev never even sees publish-like controls.
    if (isForbidden(el, forbidden)) continue;
    const text = textOf(el).slice(0, 60);
    const id = el.getAttribute(ATTR) ?? `e${++i}`;
    el.setAttribute(ATTR, id);
    out.push({
      id,
      role: el.getAttribute("role") ?? el.tagName.toLowerCase(),
      label: labelFor(el).slice(0, 60),
      text,
    });
  }
  return out;
}

export function elementById(doc: Document, id: string): Element | null {
  return doc.querySelector(`[${ATTR}="${CSS.escape(id)}"]`);
}
