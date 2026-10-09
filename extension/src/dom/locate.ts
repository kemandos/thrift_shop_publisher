import type { FieldSpec, Strategy } from "@thrift/shared";
import { isVisible, norm, textOf } from "./core";

const INTERACTIVE =
  "input:not([type=hidden]):not([type=file]), textarea, select, [role=combobox], [role=button], [role=textbox], button, [tabindex]:not([tabindex='-1'])";

const LABELISH = "label, legend, h1, h2, h3, h4, h5, h6, span, div, p, dt";

/**
 * Elements whose own short text equals the label (case/diacritics-insensitive), also with a
 * bracketed suffix: "Material (empfohlen)" matches "Material".
 */
function labelElements(root: ParentNode, label: string): Element[] {
  const want = norm(label);
  const out: Element[] = [];
  for (const el of Array.from(root.querySelectorAll(LABELISH))) {
    const t = norm(el.textContent);
    const hit = (x: string) => x === want || x.startsWith(`${want} (`);
    if (!hit(t)) continue;
    // Prefer the innermost element carrying the text.
    if (Array.from(el.children).some((c) => hit(norm(c.textContent)))) continue;
    if (isVisible(el)) out.push(el);
  }
  return out;
}

/** The first interactive element after `anchor` within its nearby container. */
function controlNear(anchor: Element): Element | null {
  if (anchor instanceof HTMLLabelElement && anchor.htmlFor) {
    const byFor = anchor.ownerDocument.getElementById(anchor.htmlFor);
    if (byFor) return byFor;
  }
  let container: Element | null = anchor.parentElement;
  for (let depth = 0; container && depth < 5; depth++, container = container.parentElement) {
    const candidates = Array.from(container.querySelectorAll(INTERACTIVE)).filter(
      (c) =>
        c !== anchor &&
        !anchor.contains(c) &&
        anchor.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING &&
        isVisible(c),
    );
    if (candidates[0]) return candidates[0];
  }
  return null;
}

export function locateBy(strategy: Strategy, root: ParentNode = document): Element | null {
  const v = strategy.value;
  switch (strategy.by) {
    case "testid":
      return root.querySelector(`[data-testid="${CSS.escape(v)}"]`);
    case "name":
      return root.querySelector(`[name="${CSS.escape(v)}"]`);
    case "css":
      return root.querySelector(v);
    case "placeholder": {
      const want = norm(v);
      return (
        Array.from(root.querySelectorAll("input, textarea")).find((e) =>
          norm(e.getAttribute("placeholder")).includes(want),
        ) ?? null
      );
    }
    case "label": {
      for (const l of labelElements(root, v)) {
        const c = controlNear(l);
        if (c) return c;
      }
      return null;
    }
  }
}

/** Resolves a field using its strategies in order. For text fields, drills down to the input/textarea. */
export function locateField(spec: FieldSpec, root: ParentNode = document): Element | null {
  for (const s of spec.locate) {
    let el = locateBy(s, root);
    if (!el) continue;
    if (spec.type === "text" || spec.type === "textarea" || spec.type === "price") {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        el = el.querySelector("input, textarea");
      }
      if (!el) continue;
    }
    return el;
  }
  return null;
}

/** Current displayed value of a picker trigger (text or input value). */
export function displayedValue(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  const input = el.querySelector("input");
  return input?.value || textOf(el);
}
