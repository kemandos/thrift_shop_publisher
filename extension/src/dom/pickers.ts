import { isVisible, norm, pressEscape, safeClick, setNativeValue, textOf, waitFor, type Pacer } from "./core";
import { isForbidden } from "./guard";

export interface Option {
  el: Element;
  label: string;
}

const OPTION_SELECTOR =
  "[role=option], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=radio], [role=checkbox], [role=treeitem], li, label, button, a, [data-testid*='option'], [data-testid*='item']";

function candidates(root: ParentNode, forbidden: readonly string[]): Option[] {
  const seen = new Set<string>();
  const out: Option[] = [];
  for (const el of Array.from(root.querySelectorAll(OPTION_SELECTOR))) {
    if (!isVisible(el)) continue;
    // Skip wrappers that contain other option candidates (keep the innermost clickable).
    if (el.querySelector("[role=option], li, button") && el.tagName !== "LABEL") continue;
    const label = textOf(el);
    if (!label || label.length > 80) continue;
    const n = norm(label);
    // Neither the AI nor the filler is ever offered a publish-like option.
    if (isForbidden(el, forbidden)) continue;
    const key = `${n}|${el.tagName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ el, label });
  }
  return out;
}

/**
 * Clicks a picker trigger and returns the options that appeared (diff against the DOM before the click).
 * Works for dropdowns, listboxes and full-screen modals (mobile).
 */
export async function openPicker(
  trigger: Element,
  doc: Document,
  forbidden: readonly string[],
  pace: Pacer,
  timeoutMs = 2000,
): Promise<Option[]> {
  const before = new Set(candidates(doc, forbidden).map((o) => o.el));
  safeClick(trigger, forbidden);
  await pace.step();
  const opts = await waitFor(() => {
    const fresh = candidates(doc, forbidden).filter((o) => !before.has(o.el) && !trigger.contains(o.el));
    return fresh.length ? fresh : null;
  }, timeoutMs);
  return opts ?? [];
}

/** Options that appeared after clicking an option (next tree level), or null if the picker closed. */
export async function nextLevel(
  clicked: Option,
  previous: Option[],
  doc: Document,
  forbidden: readonly string[],
  timeoutMs = 1500,
): Promise<Option[] | null> {
  const prev = new Set(previous.map((o) => o.el));
  const res = await waitFor(() => {
    const now = candidates(doc, forbidden);
    const fresh = now.filter((o) => !prev.has(o.el));
    if (fresh.length) return fresh;
    // Picker closed: previous options gone.
    if (!previous.some((o) => o.el.isConnected && isVisible(o.el))) return "closed" as const;
    return null;
  }, timeoutMs);
  return res === "closed" || res === null ? null : res;
}

/**
 * Deterministic match, strictest first:
 * 1. exact (normalized), 2. option starts with the wanted text ("Strick" → "Strickpullover"),
 * 3. wanted text starts with the option followed by a separator ("M / 38" → "M"),
 * 4. option contains the wanted text (only for wants of 4+ chars).
 */
export function matchOption(options: Option[], want: string | null | undefined): Option | null {
  if (!want) return null;
  const w = norm(want);
  if (!w) return null;
  const labels = options.map((o) => ({ o, n: norm(o.label) }));
  return (
    labels.find((x) => x.n === w)?.o ??
    (w.length >= 2 ? labels.find((x) => x.n.startsWith(w))?.o : undefined) ??
    labels.find((x) => x.n.length > 0 && new RegExp(`^${escapeRe(x.n)}\\s*[/|,(-]`).test(w))?.o ??
    (w.length >= 4 ? labels.find((x) => x.n.includes(w))?.o : undefined) ??
    null
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function closePicker(trigger: Element, doc: Document): Promise<void> {
  pressEscape(doc.activeElement ?? doc);
  pressEscape(doc);
  // Some pickers close on outside click; blur the trigger as a last resort.
  (trigger as HTMLElement).blur?.();
}

/** Brand-style search: type into the search box inside an open picker. */
export async function searchInPicker(
  doc: Document,
  query: string,
  before: Option[],
  forbidden: readonly string[],
  pace: Pacer,
): Promise<Option[]> {
  const search = Array.from(doc.querySelectorAll<HTMLInputElement>("input[type=search], input[type=text], input:not([type])"))
    .filter((i) => isVisible(i) && i !== doc.activeElement?.closest("form")?.querySelector("input"))
    .find((i) => /such|search|marke|brand/i.test(`${i.placeholder} ${i.getAttribute("aria-label") ?? ""}`));
  if (!search) return before;
  setNativeValue(search, query);
  search.focus();
  await pace.step();
  const res = await waitFor(() => {
    const now = candidates(doc, forbidden);
    return now.some((o) => norm(o.label).includes(norm(query))) ? now : null;
  }, 2500);
  return res ?? candidates(doc, forbidden);
}
