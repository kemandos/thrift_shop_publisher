import { isVisible, norm, pressEscape, safeClick, setNativeValue, textOf, waitFor, type Pacer } from "./core";
import { isForbidden } from "./guard";

export interface Option {
  el: Element;
  /** First visible line, e.g. "Strickjacken". */
  label: string;
  /** Further lines, e.g. the path "Herren > Kleidung > Pullover & Sweater" under a suggestion. */
  detail: string;
}

/** Semantic option elements. Rows that are plain clickable <div>s are found via `pointerRows`. */
const OPTION_SELECTOR =
  "[role=option], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=radio], [role=checkbox], [role=treeitem], " +
  "[role=button], [role=link], li, label, button, a, [data-testid*='option'], [data-testid*='item'], [tabindex]:not([tabindex='-1'])";

function lines(el: Element): string[] {
  const raw = (el as HTMLElement).innerText ?? el.textContent ?? "";
  return raw
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function toOption(el: Element): Option | null {
  const ls = lines(el);
  const label = ls[0] ?? textOf(el);
  if (!label || label.length > 80) return null;
  return { el, label, detail: ls.slice(1, 3).join(" ").slice(0, 160) };
}

const isPointer = (el: Element) => el.ownerDocument.defaultView?.getComputedStyle(el).cursor === "pointer";

/**
 * Clickable rows that are plain elements styled with cursor:pointer (common in React UIs such as
 * Vinted's dropdown "cells"): the outermost pointer element of each row inside the picker roots.
 */
function pointerRows(roots: Element[], limit = 600): Element[] {
  const out: Element[] = [];
  let seen = 0;
  for (const root of roots) {
    for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
      if (++seen > limit) return out;
      if (!(el instanceof HTMLElement) || !isPointer(el)) continue;
      // cursor is inherited: a row is a pointer element whose parent is not (or is the picker root itself).
      const parent = el.parentElement;
      if (el !== root && parent && parent !== root && isPointer(parent)) continue;
      if (el === root && el.querySelector("*")) continue;
      out.push(el);
    }
  }
  return out;
}

/**
 * Visible option candidates: semantic elements plus clickable rows. With `roots` (what an opened
 * picker added), only inside them; otherwise on the whole page. `accept` filters before de-duplication.
 */
export function candidates(
  doc: Document,
  forbidden: readonly string[],
  roots: Element[] = [],
  accept: (el: Element) => boolean = () => true,
): Option[] {
  const seen = new Set<string>();
  const out: Option[] = [];
  const add = (el: Element) => {
    if (!accept(el) || !isVisible(el) || el.closest("[data-thrift-ui]")) return;
    // Neither the AI nor the filler is ever offered a publish-like option.
    if (isForbidden(el, forbidden)) return;
    const o = toOption(el);
    if (!o) return;
    const key = `${norm(o.label)}|${norm(o.detail)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(o);
  };
  const scopes: ParentNode[] = roots.length ? roots : [doc];
  const semantic = scopes
    .flatMap((sc) => [...(sc instanceof Element && sc.matches(OPTION_SELECTOR) ? [sc] : []), ...Array.from(sc.querySelectorAll(OPTION_SELECTOR))])
    // Skip wrappers that contain other option candidates (keep the innermost clickable).
    .filter((el) => el.tagName === "LABEL" || !el.querySelector("[role=option], li, button, [role=button]"));
  for (const el of semantic) add(el);
  for (const row of pointerRows(roots)) {
    // A row already represented by a semantic element inside it is skipped.
    if (out.some((o) => row.contains(o.el) || o.el.contains(row))) continue;
    add(row);
  }
  return out;
}

/** Records elements added to the page after it starts (the opened dropdown/modal). */
function watchAdded(doc: Document) {
  const added = new Set<Element>();
  const obs = new MutationObserver((records) => {
    for (const r of records) for (const n of Array.from(r.addedNodes)) if (n instanceof Element) added.add(n);
  });
  obs.observe(doc.documentElement, { childList: true, subtree: true });
  return {
    roots(): Element[] {
      const live = Array.from(added).filter((e) => e.isConnected && !e.closest("[data-thrift-ui]"));
      return live.filter((e) => !live.some((o) => o !== e && o.contains(e)));
    },
    stop: () => obs.disconnect(),
  };
}

export interface PickerSession {
  trigger: Element;
  /** Options visible right after opening. */
  options: Option[];
  /** Current options of the open picker (new since opening). */
  scan(): Option[];
  /** Compact DOM outline of the picker, for the fill log. */
  outline(maxNodes?: number): string;
  dispose(): void;
}

/**
 * Clicks a picker trigger and returns the options that appeared (diff against the DOM before the click).
 * Works for dropdowns, listboxes and full-screen modals (mobile), including div-based rows.
 */
export async function openPicker(
  trigger: Element,
  doc: Document,
  forbidden: readonly string[],
  pace: Pacer,
  timeoutMs = 2000,
): Promise<PickerSession> {
  // Everything already on the page is never an option of this picker (not just per label: several
  // "Auswählen" triggers share a label, and one of them must never look "new" later).
  const before = new Set(Array.from(doc.querySelectorAll("*")));
  const watch = watchAdded(doc);
  const scan = () => {
    // Options live inside what the picker added (dropdown/modal), when we saw it being added.
    const roots = watch.roots().filter((r) => !trigger.contains(r));
    return candidates(doc, forbidden, roots, (el) => !before.has(el) && el !== trigger && !trigger.contains(el));
  };
  safeClick(trigger, forbidden);
  await pace.step();
  const opts = (await waitFor(() => {
    const fresh = scan();
    return fresh.length ? fresh : null;
  }, timeoutMs)) ?? [];
  return {
    trigger,
    options: opts,
    scan,
    outline: (max = 60) => outline(watch.roots(), max),
    dispose: () => watch.stop(),
  };
}

/** Options that appeared after clicking an option (next tree level), or null if the picker closed. */
export async function nextLevel(session: PickerSession, previous: Option[], timeoutMs = 1500): Promise<Option[] | null> {
  // React may reuse row elements for the next level, so compare element + text, not elements only.
  const prev = new Set(previous.map((o) => `${norm(o.label)}|${norm(o.detail)}`));
  const res = await waitFor(() => {
    const now = session.scan();
    const fresh = now.filter((o) => !prev.has(`${norm(o.label)}|${norm(o.detail)}`));
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
export function matchOption<T extends { label: string }>(options: T[], want: string | null | undefined): T | null {
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

/** Splits "Herren > Kleidung > Pullover & Sweater" (also › / ») into segments. */
export function pathSegments(detail: string): string[] {
  return detail
    .split(/\s*[>›»/]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Picks the option for a category leaf whose shown path fits the wanted path.
 * The top level (Damen/Herren/Kinder …) must match when a path is shown, so a suggestion for the
 * wrong department is never taken. Returns null when nothing fits or several fit equally.
 */
export function pickByPath<T extends Option>(options: T[], wantPath: string[]): { pick: T | null; tied: T[] } {
  const leaf = wantPath.at(-1);
  if (!leaf) return { pick: null, tied: [] };
  const named = options.filter((o) => norm(o.label) === norm(leaf));
  const top = norm(wantPath[0]);
  const scored = named
    .map((o) => {
      const segs = pathSegments(o.detail).map(norm);
      if (segs.length && wantPath.length > 1 && segs[0] !== top) return null;
      const score = wantPath.slice(0, -1).filter((w) => segs.includes(norm(w))).length;
      return { o, score, hasPath: segs.length > 0 };
    })
    .filter((x): x is { o: T; score: number; hasPath: boolean } => x !== null);
  if (!scored.length) return { pick: null, tied: [] };
  const best = Math.max(...scored.map((s) => s.score));
  const top1 = scored.filter((s) => s.score === best);
  if (top1.length === 1) return { pick: top1[0]!.o, tied: [] };
  return { pick: null, tied: top1.map((s) => s.o) };
}

export async function closePicker(trigger: Element, doc: Document): Promise<void> {
  pressEscape(doc.activeElement ?? doc);
  pressEscape(doc);
  // Some pickers close on outside click; blur the trigger as a last resort.
  (trigger as HTMLElement).blur?.();
}

/** The search box inside an open picker (Vinted: "Finde eine Kategorie", "Marke suchen"). */
export function findPickerSearch(doc: Document, session: PickerSession): HTMLInputElement | null {
  const inputs = Array.from(doc.querySelectorAll<HTMLInputElement>("input[type=search], input[type=text], input:not([type])")).filter(
    (i) => isVisible(i) && i !== session.trigger && !session.trigger.contains(i) && !i.closest("[data-thrift-ui]"),
  );
  return (
    inputs.find((i) => /such|search|finde|find|filter/i.test(`${i.placeholder} ${i.getAttribute("aria-label") ?? ""}`)) ??
    null
  );
}

/** Types into the picker's search box and returns the options shown for that query. */
export async function searchInPicker(doc: Document, session: PickerSession, query: string, pace: Pacer): Promise<Option[] | null> {
  const search = findPickerSearch(doc, session);
  if (!search) return null;
  setNativeValue(search, query, { blur: false });
  await pace.step();
  const q = norm(query);
  const res = await waitFor(() => {
    const now = session.scan();
    return now.some((o) => norm(o.label).includes(q)) ? now : null;
  }, 2500);
  return res ?? session.scan();
}

export async function clearPickerSearch(doc: Document, session: PickerSession, pace: Pacer): Promise<void> {
  const search = findPickerSearch(doc, session);
  if (!search || !search.value) return;
  setNativeValue(search, "", { blur: false });
  await pace.step();
}

/** Compact outline of the picker DOM: tag, role, test id, short class, first text. No values from inputs. */
function outline(roots: Element[], maxNodes: number): string {
  const out: string[] = [];
  const walk = (el: Element, depth: number) => {
    if (out.length >= maxNodes || depth > 8) return;
    if (!isVisible(el)) return;
    const role = el.getAttribute("role");
    const tid = el.getAttribute("data-testid");
    const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim())
      .join(" ")
      .slice(0, 40);
    const ph = el.getAttribute("placeholder");
    const bits = [
      el.tagName.toLowerCase() + (cls ? `.${cls.slice(0, 50)}` : ""),
      role && `role=${role}`,
      tid && `testid=${tid}`,
      ph && `placeholder="${ph}"`,
      isPointer(el) && !(el.parentElement && isPointer(el.parentElement)) && "pointer",
      own && `"${own}"`,
    ].filter(Boolean);
    out.push(`${"  ".repeat(depth)}${bits.join(" ")}`);
    for (const c of Array.from(el.children)) walk(c, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  return out.join("\n");
}

