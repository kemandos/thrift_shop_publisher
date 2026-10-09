/** Small DOM helpers shared by the fillers. Framework-agnostic (works with React-controlled inputs). */
import { forbiddenReason } from "./guard";

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

/** Throws if an element looks like a submit/upload/save control (see guard.ts). The extension never submits. */
export function assertClickable(el: Element, forbidden: readonly string[]): void {
  const reason = forbiddenReason(el, forbidden);
  if (reason) throw new ForbiddenClickError(reason);
}

export function safeClick(el: Element, forbidden: readonly string[]): void {
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
export function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  opts: { blur?: boolean } = {},
): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  el.focus();
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  // Search boxes inside pickers must keep focus, or the picker closes.
  if (opts.blur !== false) el.blur();
}

export function pressEscape(target: Element | Document): void {
  const opts = { key: "Escape", code: "Escape", bubbles: true, cancelable: true };
  target.dispatchEvent(new KeyboardEvent("keydown", opts));
  target.dispatchEvent(new KeyboardEvent("keyup", opts));
}

export interface Pacer {
  /** Pause between steps (opening a picker, choosing, next field). */
  step(): Promise<void>;
  /** Short pause inside one gesture (hover → press → release) or between typed keys. */
  tap(): Promise<void>;
  wait(ms: number): Promise<void>;
}

/**
 * Human-like pacing: 450–1100 ms between steps, 50–160 ms inside a gesture. Slow on purpose, so the
 * form is filled at a person's speed. Tests pass pacer(0, 0) (and get tap = 0 as well).
 */
export function pacer(min = 450, max = 1100): Pacer {
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
  const fast = max === 0;
  return {
    step: () => wait(rnd(min, max)),
    tap: () => (fast ? Promise.resolve() : wait(rnd(50, 160))),
    wait,
  };
}

function pointerInit(el: Element): MouseEventInit & PointerEventInit {
  const r = el.getBoundingClientRect();
  // Somewhere inside the element, not exactly the centre.
  const x = r.left + r.width * (0.35 + Math.random() * 0.3);
  const y = r.top + r.height * (0.35 + Math.random() * 0.3);
  return { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, screenX: x, screenY: y, view: el.ownerDocument.defaultView, button: 0, pointerId: 1, pointerType: "mouse", isPrimary: true };
}

/**
 * A click the way a mouse produces it: hover, press, release, click, with short pauses and real
 * coordinates. Checked against the publish guard first, like every click.
 */
export async function humanClick(el: Element, forbidden: readonly string[], pace: Pacer): Promise<void> {
  assertClickable(el, forbidden);
  const h = el as HTMLElement;
  h.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  await pace.tap();
  const init = pointerInit(el);
  for (const t of ["pointerover", "pointerenter", "pointermove"]) h.dispatchEvent(new PointerEvent(t, init));
  for (const t of ["mouseover", "mouseenter", "mousemove"]) h.dispatchEvent(new MouseEvent(t, init));
  await pace.tap();
  h.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
  h.dispatchEvent(new MouseEvent("mousedown", { ...init, buttons: 1 }));
  if (h.focus && h.tabIndex >= 0) h.focus({ preventScroll: true });
  await pace.tap();
  h.dispatchEvent(new PointerEvent("pointerup", init));
  h.dispatchEvent(new MouseEvent("mouseup", init));
  // Native inputs/labels need their activation behaviour (checking a radio etc.): use click().
  if (h instanceof HTMLInputElement || h instanceof HTMLLabelElement || h instanceof HTMLButtonElement) h.click();
  else h.dispatchEvent(new MouseEvent("click", { ...init, detail: 1 }));
}

/** Types text key by key (keydown → input → keyup), like a person typing into a search box. */
export async function typeText(input: HTMLInputElement, text: string, pace: Pacer): Promise<void> {
  const proto = HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  const set = (v: string) => (setter ? setter.call(input, v) : (input.value = v));
  input.focus();
  if (input.value) {
    set("");
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  }
  for (const ch of text) {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
    set(input.value + ch);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
    await pace.tap();
  }
  input.dispatchEvent(new Event("change", { bubbles: true }));
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
