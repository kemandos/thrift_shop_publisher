/** Small DOM helpers shared by the fillers. Framework-agnostic (works with React-controlled inputs). */

export const norm = (s: string | null | undefined): string =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** First line of an element's visible text, collapsed. */
export function textOf(el: Element): string {
  const raw = (el as HTMLElement).innerText ?? el.textContent ?? "";
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  return (line ?? "").replace(/\s+/g, " ").trim();
}

export function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return true;
  if (el.closest("[hidden],[aria-hidden='true']")) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  // happy-dom has no layout; real browsers do.
  if (typeof el.getClientRects === "function" && el.ownerDocument.defaultView?.navigator.userAgent.includes("HappyDOM") === false) {
    if (el.getClientRects().length === 0) return false;
  }
  return true;
}

export class ForbiddenClickError extends Error {}

/** Throws if an element looks like a submit/upload/save control. The extension never submits. */
export function assertClickable(el: Element, forbidden: string[]): void {
  const html = el as HTMLElement & { type?: string; value?: string };
  const btn = el.closest("button, input, a, [role=button]") as (HTMLElement & { type?: string }) | null;
  const target = btn ?? html;
  if ((target.tagName === "BUTTON" || target.tagName === "INPUT") && target.type === "submit") {
    throw new ForbiddenClickError("submit control");
  }
  const label = norm([textOf(target), target.getAttribute("aria-label"), (target as HTMLInputElement).value].join(" "));
  for (const word of forbidden) {
    if (new RegExp(`(^|\\W)${norm(word)}(\\W|$)`).test(label)) throw new ForbiddenClickError(`forbidden: ${word}`);
  }
}

export function safeClick(el: Element, forbidden: string[]): void {
  assertClickable(el, forbidden);
  const h = el as HTMLElement;
  h.scrollIntoView?.({ block: "center" });
  const opts = { bubbles: true, cancelable: true, composed: true };
  h.dispatchEvent(new PointerEvent("pointerdown", opts));
  h.dispatchEvent(new MouseEvent("mousedown", opts));
  h.dispatchEvent(new PointerEvent("pointerup", opts));
  h.dispatchEvent(new MouseEvent("mouseup", opts));
  h.click();
}

/** Sets a value so React/Vue-controlled inputs register it. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  el.focus();
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.blur();
}

export function pressEscape(target: Element | Document): void {
  const opts = { key: "Escape", code: "Escape", bubbles: true, cancelable: true };
  target.dispatchEvent(new KeyboardEvent("keydown", opts));
  target.dispatchEvent(new KeyboardEvent("keyup", opts));
}

export interface Pacer {
  step(): Promise<void>;
  wait(ms: number): Promise<void>;
}

/** Human-like pacing between steps (120–300 ms). Tests pass {min:0,max:0}. */
export function pacer(min = 120, max = 300): Pacer {
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  return {
    step: () => wait(min + Math.random() * (max - min)),
    wait,
  };
}

/** Polls until fn returns a truthy value or timeout. */
export async function waitFor<T>(fn: () => T | null | undefined | false, timeoutMs = 2000, everyMs = 50): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() >= end) return null;
    await new Promise((r) => setTimeout(r, everyMs));
  }
}
