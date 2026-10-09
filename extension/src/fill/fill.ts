import {
  CONDITION_LABELS,
  type AiResponse,
  type AnalyzeResult,
  type Attributes,
  type ChooseResult,
  type FieldKey,
  type FormMap,
  type ListingStyle,
  type ListingText,
  type Photo,
  type PickElementResult,
} from "@thrift/shared";
import { displayedValue, locateField } from "../dom/locate";
import { humanClick, isVisible, norm, setNativeValue, typeText, type Pacer } from "../dom/core";
import {
  closePicker,
  matchOption,
  nextLevel,
  openPicker,
  type LevelResult,
  pathSegments,
  pickByPath,
  searchInPicker,
  type Option,
  type PickerSession,
} from "../dom/pickers";
import { elementById, snapshotElements } from "../dom/snapshot";
import { isForbidden, lockSubmission } from "../dom/guard";

export interface AiApi {
  analyze(p: { photos: Photo[]; style: ListingStyle; categoryOptions: string[] }): Promise<AiResponse<AnalyzeResult>>;
  rewrite(p: { attributes: Attributes; style: ListingStyle }): Promise<AiResponse<ListingText>>;
  choose(p: {
    field: "category" | "size" | "condition" | "color" | "brand" | "material" | "other";
    fieldLabel?: string;
    attributes: Attributes;
    pathSoFar?: string[];
    mode?: "tree" | "suggestions";
    options: string[];
  }): Promise<AiResponse<ChooseResult>>;
  pickElement(p: { goal: string; elements: { id: string; role: string; label: string; text: string }[] }): Promise<
    AiResponse<PickElementResult>
  >;
}

export interface Unresolved {
  key: FieldKey;
  label: string;
  /** Value the user can copy/choose by hand. */
  value: string;
}

export interface FillReport {
  filled: FieldKey[];
  unresolved: Unresolved[];
  attributes: Attributes;
  text: ListingText;
}

export interface FillContext {
  doc: Document;
  map: FormMap;
  ai: AiApi;
  pace: Pacer;
  status?: (msg: string) => void;
  /** How long to wait for Vinted's own category/brand detection (default 5 s; continues as soon as both are set). */
  vintedWaitMs?: number;
  /** Fill log for "Protokoll kopieren" (what was seen and chosen; no photos, no keys). */
  log?: (line: string) => void;
}

const FIELD_LABEL: Record<FieldKey, string> = {
  title: "Titel",
  description: "Beschreibung",
  category: "Kategorie",
  brand: "Marke",
  size: "Größe",
  condition: "Zustand",
  color: "Farbe",
  material: "Material",
  price: "Preis",
};

export function descriptionWithHashtags(text: ListingText): string {
  const tags = text.hashtags.map((h) => `#${h.replace(/\s+/g, "")}`).join(" ");
  return tags ? `${text.description}\n\n${tags}` : text.description;
}

/** Short element description for the log: tag, test id, placeholder, role. */
function describe(el: Element): string {
  const a = (n: string) => el.getAttribute(n);
  return [
    el.tagName.toLowerCase(),
    a("data-testid") && `testid=${a("data-testid")}`,
    a("placeholder") && `placeholder="${a("placeholder")}"`,
    a("role") && `role=${a("role")}`,
    a("readonly") !== null && "readonly",
  ]
    .filter(Boolean)
    .join(" ");
}

export function suggestedPrice(a: Attributes): number {
  return Math.round((a.priceMinEur + a.priceMaxEur) / 2);
}

/** Field → element, with AI element picking as fallback when the form map does not match. */
async function resolve(ctx: FillContext, key: FieldKey, aiFallback = true): Promise<Element | null> {
  const spec = ctx.map.fields[key];
  if (!spec) return null;
  const el = locateField(spec, ctx.doc);
  if (el) {
    ctx.log?.(`${key}: Feld ${describe(el)}`);
    return el;
  }
  // Fields that only exist after a category is chosen are not searched for with the AI.
  if (!aiFallback) return null;
  const elements = snapshotElements(ctx.doc, ctx.map.forbiddenClickText);
  if (!elements.length) return null;
  try {
    const { result } = await ctx.ai.pickElement({
      goal: `The input or picker for the field "${FIELD_LABEL[key]}" (${key}) in Vinted's "Artikel verkaufen" form.`,
      elements,
    });
    if (!result.id) return null;
    let picked = elementById(ctx.doc, result.id);
    // Second check: whatever the model answers, a publish-like control is never used.
    if (!picked || isForbidden(picked, ctx.map.forbiddenClickText)) return null;
    if (picked && (spec.type === "text" || spec.type === "textarea" || spec.type === "price")) {
      if (!(picked instanceof HTMLInputElement || picked instanceof HTMLTextAreaElement)) {
        picked = picked.querySelector("input, textarea");
      }
    }
    return picked;
  } catch {
    return null;
  }
}

/** "12,00 €" → 12 */
const amount = (s: string) => Number((s.match(/\d+(?:[.,]\d+)?/)?.[0] ?? "NaN").replace(",", "."));

async function fillText(ctx: FillContext, key: FieldKey, value: string): Promise<boolean> {
  const el = await resolve(ctx, key);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  if (key === "price" && el instanceof HTMLInputElement) {
    // Vinted formats the price itself ("17,00 €"): type it like a person and compare the amount.
    await typeText(el, value, ctx.pace);
    el.blur();
    await ctx.pace.step();
    const ok = await waitUntil(() => amount(el.value) === Number(value), 1500);
    ctx.log?.(`price: getippt „${value}“, Feld zeigt „${el.value}“`);
    return ok;
  }
  setNativeValue(el, value);
  await ctx.pace.step();
  return el.value === value;
}

type ChooseField = "size" | "condition" | "color" | "brand" | "material";

const optionList = (opts: Option[]) =>
  opts
    .slice(0, 25)
    .map((o) => (o.detail ? `${o.label} (${o.detail})` : o.label))
    .join(" | ");

/** Deterministic pick first (exact facts), AI choice second. */
async function chooseOption(
  ctx: FillContext,
  field: ChooseField,
  attrs: Attributes,
  options: Option[],
  want: string | null,
): Promise<Option | null> {
  // Brand: only an exact name match ("COS", never "Cosmo"), never the AI.
  if (field === "brand") return want ? (options.find((o) => norm(o.label) === norm(want)) ?? null) : null;
  const direct = matchOption(options, want);
  if (direct) return direct;
  if (field === "size" && !attrs.size) return null; // never guessed
  try {
    const { result } = await ctx.ai.choose({ field, attributes: attrs, options: options.map((o) => o.label) });
    return result.choice ? (options.find((o) => o.label === result.choice) ?? null) : null;
  } catch {
    return null;
  }
}

async function withPicker<T>(ctx: FillContext, key: FieldKey, trigger: Element, run: (s: PickerSession) => Promise<T>): Promise<T> {
  const session = await openPicker(trigger, ctx.doc, ctx.map.forbiddenClickText, ctx.pace);
  ctx.log?.(`${key}: Auswahl geöffnet, ${session.options.length} Optionen: ${optionList(session.options)}`);
  if (!session.options.length || key === "category") ctx.log?.(`${key}: Aufbau der Auswahl:\n${session.outline(80)}`);
  try {
    return await run(session);
  } finally {
    session.dispose();
  }
}

/** The field shows the value: exact per item, or (for 3+ characters) contained in what it shows. */
function valueShown(trigger: Element, value: string): boolean {
  if (hasValue(trigger, value)) return true;
  const v = norm(value);
  return v.length >= 3 && norm(displayedValue(trigger)).includes(v);
}

async function waitUntil(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 60));
  }
  return check();
}

/**
 * What to click for an option, most likely first: the row itself, a native radio/checkbox inside,
 * its label, an inner element with a role, the innermost element carrying the text.
 */
function clickTargets(row: Element, label: string): Element[] {
  const out: Element[] = [];
  const push = (e: Element | null | undefined) => {
    if (e && !out.includes(e)) out.push(e);
  };
  push(row);
  push(row.querySelector("input[type=radio], input[type=checkbox]"));
  push(row.querySelector("label") ?? row.closest("label"));
  push(row.querySelector("[role=option], [role=radio], [role=checkbox], [role=button], button"));
  const want = norm(label);
  push(
    Array.from(row.querySelectorAll("*"))
      .reverse()
      .find((e) => norm(e.textContent) === want),
  );
  return out;
}

/**
 * Clicks an option until the field really shows it (Vinted must accept the choice, not just see a
 * click). Tries the next target when it did not take. Returns true when confirmed.
 */
async function selectOption(
  ctx: FillContext,
  key: string,
  pick: Option,
  confirmed: () => boolean,
  skip = 0,
  maxTargets = 5,
): Promise<boolean> {
  const forbidden = ctx.map.forbiddenClickText;
  for (const t of clickTargets(pick.el, pick.label).slice(skip, skip + maxTargets)) {
    if (!t.isConnected) break;
    try {
      await humanClick(t, forbidden, ctx.pace);
    } catch (e) {
      ctx.log?.(`${key}: Klick auf ${describe(t)} abgelehnt (${e instanceof Error ? e.message : String(e)})`);
      continue;
    }
    if (await waitUntil(confirmed, 1500)) {
      ctx.log?.(`${key}: „${pick.label}“ übernommen (Klick auf ${describe(t)})`);
      return true;
    }
    ctx.log?.(`${key}: Klick auf ${describe(t)} – noch nicht übernommen`);
    await ctx.pace.tap();
  }
  return false;
}

async function fillList(ctx: FillContext, key: ChooseField, attrs: Attributes, want: string | null): Promise<string | null> {
  // Only called once the category is set, so the fields exist: the AI may help find renamed ones.
  const trigger = await resolve(ctx, key);
  if (!trigger) {
    ctx.log?.(`${key}: Feld nicht gefunden`);
    return null;
  }
  if (want && hasValue(trigger, want)) return want; // already set (e.g. by Vinted)
  let chosen: Option | null = null;
  // Up to two rounds: if the picker closed without taking the value, open it again and try other targets.
  for (let round = 0; round < 2; round++) {
    const result = await withPicker(ctx, key, trigger, async (session) => {
      let options = session.options;
      if (!options.length) return "none" as const;
      if (key === "brand" && want) {
        const found = await searchInPicker(ctx.doc, session, want, ctx.pace);
        if (found) {
          options = found;
          ctx.log?.(`${key}: Suche „${want}“: ${optionList(options)}`);
        }
      }
      const pick = chosen
        ? (options.find((o) => o.label === chosen!.label && o.detail === chosen!.detail) ?? null)
        : await chooseOption(ctx, key, attrs, options, want);
      if (!pick) {
        ctx.log?.(`${key}: keine passende Option für „${want ?? ""}“`);
        await closePicker(trigger, ctx.doc);
        return "none" as const;
      }
      chosen = pick;
      await ctx.pace.step(); // a person looks before clicking
      const confirmed = () => valueShown(trigger, pick.label);
      // Multi-select (colour): one click only – a second click would unselect it again.
      const multi = key === "color";
      if (multi && round > 0) return "none" as const;
      let ok = await selectOption(ctx, key, pick, confirmed, round, multi ? 1 : 5);
      // Multi-select pickers (colour) stay open; some only update the field when closed.
      if (pick.el.isConnected && isVisible(pick.el)) {
        await closePicker(trigger, ctx.doc);
        await ctx.pace.tap();
        ok = ok || (await waitUntil(confirmed, 800));
      }
      ctx.log?.(`${key}: Feld zeigt jetzt „${displayedValue(trigger)}“`);
      return ok ? ("ok" as const) : ("retry" as const);
    });
    if (result === "ok") return chosen!.label;
    if (result === "none") return null;
    await ctx.pace.step();
  }
  return null;
}



/** Rows that are navigation, not a category ("Zurück", "Alle"). */
const NAV_ROW = /^(zuruck|zurück|back|alle|all|alles anzeigen|show all)$/;

/**
 * Category when Vinted did not detect it itself: open the dropdown and classify level by level
 * (e.g. skirt → Damen → Kleidung → Röcke → the closest leaf), like a person clicking through it.
 * 1. a visible Vinted suggestion with the right leaf and department → take it,
 * 2. otherwise per level: exact match with the analysed path, else the AI picks the closest option.
 * Bounded (max 6 levels, every wait has a timeout), so it never gets stuck; on doubt it stops and the
 * category is offered as a copy value.
 */
/** Picks the tree option for the analysed path: any remaining path segment may match (paths can skip levels). */
function matchPathLevel(options: Option[], want: string[], cursor: number): { pick: Option; next: number } | null {
  for (let i = cursor; i < want.length; i++) {
    const pick = matchOption(options, want[i]);
    if (pick) return { pick, next: i + 1 };
  }
  return null;
}

/**
 * Vinted's suggestions ("Shorts mit hoher Taille — Damen > Kleidung > Shorts") are taken directly – no
 * extra AI call – when they agree with the analysis: an exact path match, or same department and the
 * same kind of garment. Vinted can be wrong (it suggested a skirt for shorts), so nothing else is taken.
 */
function chooseSuggestion(ctx: FillContext, attrs: Attributes, suggestions: Option[], want: string[]): Option | null {
  if (!suggestions.length) return null;
  const dept = norm(want[0]);
  const pick =
    pickByPath(suggestions, want).pick ??
    suggestions.find(
      (o) =>
        (!dept || norm(pathSegments(o.detail)[0]) === dept) &&
        sameKind(`${o.label} ${pathSegments(o.detail).slice(1).join(" ")}`, [attrs.itemType, ...want.slice(1)]),
    ) ??
    null;
  ctx.log?.(`category: Vinted-Vorschläge ${optionList(suggestions)} → ${pick ? `passt: ${pick.label}` : "passt nicht zur Analyse"}`);
  return pick;
}

/** How well an option fits the analysis without asking the AI (shared word stems with path/item type). */
function kindScore(label: string, words: string[]): number {
  const stems = (x: string) =>
    norm(x)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 4 && !GENERIC_WORD.test(w));
  const ws = words.flatMap(stems);
  return stems(label).filter((c) => ws.some((w) => w.includes(c.slice(0, 4)) || c.includes(w.slice(0, 4)))).length;
}

/**
 * Category when Vinted did not set it itself – like a person:
 * 1. Vinted's suggestions (with path): only one that agrees with the analysis,
 * 2. otherwise click through the tree level by level: a matching path segment, else the AI picks the
 *    closest option. A click that does not take is retried on the row's inner targets (radio, label, text).
 * Bounded (max 7 levels, timeouts everywhere), so it never gets stuck.
 */
async function fillCategory(ctx: FillContext, attrs: Attributes, trigger: Element): Promise<string[] | null> {
  const want = attrs.categoryPath.filter(Boolean);
  ctx.log?.(`category: nicht von Vinted gesetzt – klassifiziere selbst (Ziel ${want.join(" › ") || attrs.itemType})`);
  const forbidden = ctx.map.forbiddenClickText;
  // Also used to replace a wrong category Vinted set itself: success means the field changed.
  const before = displayedValue(trigger);
  const isPath = (o: Option) => /[\p{L}\p{N}]\s*[>›]\s*[\p{L}\p{N}]/u.test(o.detail);
  return withPicker(ctx, "category", trigger, async (session) => {
    const changed = () => looksSet(trigger) && displayedValue(trigger) !== before;
    const suggestion = chooseSuggestion(ctx, attrs, session.options.filter(isPath), want);
    if (suggestion) {
      await ctx.pace.step();
      if (await selectOption(ctx, "category", suggestion, changed)) {
        await closeIfOpen(ctx, session);
        return [...pathSegments(suggestion.detail), suggestion.label];
      }
    }

    // Tree rows only: no suggestions and no navigation rows.
    const treeRows = (opts: Option[]) => opts.filter((o) => !isPath(o) && !NAV_ROW.test(norm(o.label)));
    let options = treeRows(session.scan().length ? session.scan() : session.options);
    const path: string[] = [];
    let cursor = 0;
    for (let level = 0; options.length && level < 7; level++) {
      const m = matchPathLevel(options, want, cursor);
      let pick = m?.pick ?? null;
      if (m) cursor = m.next;
      else {
        // Similar names (no AI): "Shorts" for "Shorts & Bermudas", "Pullover & Sweater" for "Strickpullover".
        const scored = options
          .map((o) => ({ o, score: kindScore(o.label, [...want.slice(cursor), attrs.itemType]) }))
          .filter((x) => x.score > 0)
          .sort((x, y) => y.score - x.score);
        if (scored.length && (scored.length === 1 || scored[0]!.score > scored[1]!.score)) pick = scored[0]!.o;
      }
      if (!pick) {
        try {
          const { result } = await ctx.ai.choose({
            field: "category",
            attributes: attrs,
            pathSoFar: path,
            options: options.map((o) => o.label),
          });
          pick = result.choice ? (options.find((o) => o.label === result.choice) ?? null) : null;
        } catch {
          pick = null;
        }
        ctx.log?.(`category: Ebene ${level + 1}: KI wählt „${pick?.label ?? "–"}“ aus ${optionList(options)}`);
      }
      if (!pick) break;
      path.push(pick.label);
      await ctx.pace.step();
      // Click until something happens: next level, picker closed, or the field shows a value.
      let outcome: LevelResult = { kind: "same" };
      for (const t of clickTargets(pick.el, pick.label)) {
        if (!t.isConnected) break;
        await humanClick(t, forbidden, ctx.pace);
        outcome = await nextLevel(session, options);
        if (outcome.kind !== "same" || changed()) break;
        ctx.log?.(`category: Klick auf ${describe(t)} bei „${pick.label}“ – keine Reaktion`);
        await ctx.pace.tap();
      }
      if (changed() && outcome.kind !== "next") break; // leaf chosen
      if (outcome.kind !== "next") break;
      options = treeRows(outcome.options);
    }
    const ok = changed();
    ctx.log?.(`category: ${ok ? "gewählt" : "nicht gesetzt"} ${path.join(" › ")}, Feld zeigt „${displayedValue(trigger)}“`);
    await closeIfOpen(ctx, session);
    return ok ? path : null;
  });
}

async function closeIfOpen(ctx: FillContext, session: PickerSession): Promise<void> {
  if (session.scan().some((o) => o.el.isConnected && isVisible(o.el))) await closePicker(session.trigger, ctx.doc);
}

/** The whole fill: AI analysis from the photos, then every field. Never submits. */
export async function fillForm(ctx: FillContext, photos: Photo[], style: ListingStyle): Promise<FillReport> {
  const release = lockSubmission(ctx.doc, ctx.map.forbiddenClickText);
  try {
    return await fillFormUnlocked(ctx, photos, style);
  } finally {
    release();
  }
}

/** Words that say nothing about the kind of garment. */
const GENERIC_WORD = /^(damen|herren|kinder|madchen|jungen|kleidung|mode|sonstige|sonstiges|andere|other|women|men|kids|clothing)$/;

/**
 * Rough check that Vinted's category and the analysis talk about the same kind of garment
 * ("Röcke" ~ "Minirock", "Shorts mit hoher Taille" ~ "Shorts"; "Röcke" ≁ "Shorts").
 */
export function sameKind(category: string, analysed: string[]): boolean {
  const words = (x: string) =>
    norm(x)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 4 && !GENERIC_WORD.test(w));
  const cat = words(category);
  const ana = analysed.flatMap(words);
  return cat.some((c) => ana.some((w) => w.includes(c.slice(0, 4)) || c.includes(w.slice(0, 4))));
}

/** Extra pickers Vinted shows for some categories ("Rocklänge", …): a "Wähle …" field we do not know. */
async function fillExtraFields(ctx: FillContext, attrs: Attributes): Promise<void> {
  const known = new Set(
    Object.values(ctx.map.fields)
      .map((spec) => (spec ? locateField(spec, ctx.doc) : null))
      .filter((e): e is Element => !!e),
  );
  const extras = Array.from(ctx.doc.querySelectorAll<HTMLInputElement>("input[placeholder]")).filter(
    (i) => /^w(ä|a)hle\b/i.test(i.placeholder) && !known.has(i) && !i.value && isVisible(i) && !i.closest("[data-thrift-ui]"),
  );
  for (const trigger of extras.slice(0, 4)) {
    const label = fieldLabelOf(trigger);
    ctx.log?.(`extra: Feld „${label}“ (${describe(trigger)})`);
    ctx.status?.(`Wähle ${label} …`);
    await withPicker(ctx, "extra" as FieldKey, trigger, async (session) => {
      if (!session.options.length) return;
      // Directly when the item type says it ("Minirock" → "Mini"); the AI only otherwise.
      const itemWords = norm([attrs.itemType, ...attrs.categoryPath].join(" "));
      const direct = session.options.filter((o) => norm(o.label).length >= 3 && itemWords.includes(norm(o.label)));
      let pick: Option | null = direct.length === 1 ? direct[0]! : null;
      if (!pick) try {
        const { result } = await ctx.ai.choose({
          field: "other",
          fieldLabel: label.slice(0, 60),
          attributes: attrs,
          options: session.options.map((o) => o.label),
        });
        pick = result.choice ? (session.options.find((o) => o.label === result.choice) ?? null) : null;
      } catch {
        pick = null;
      }
      ctx.log?.(`extra: „${label}“ → ${pick ? `„${pick.label}“` : "offen gelassen"}`);
      if (!pick) return closePicker(trigger, ctx.doc);
      await ctx.pace.step();
      await selectOption(ctx, "extra", pick, () => valueShown(trigger, pick!.label));
      await closeIfOpen(ctx, session);
    });
  }
}

/** The visible label of a form row ("Rocklänge"), not the placeholder. */
function fieldLabelOf(input: HTMLInputElement): string {
  let el: Element | null = input.parentElement;
  for (let d = 0; el && d < 5; d++, el = el.parentElement) {
    const line = ((el as HTMLElement).innerText ?? "")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && l !== input.placeholder && /[\p{L}]/u.test(l));
    if (line) return line.slice(0, 60);
  }
  return input.placeholder;
}

/** The field shows a chosen value (not empty, not a "Wähle …" / "Auswählen" prompt). */
export function looksSet(trigger: Element | null): boolean {
  if (!trigger) return false;
  const v = displayedValue(trigger).trim();
  if (!v) return false;
  if (trigger instanceof HTMLInputElement || trigger instanceof HTMLTextAreaElement) return true;
  return !/^(w(ä|a)hle|auswahlen|auswählen|bitte w(ä|a)hlen|select|choose)\b/i.test(v);
}

async function fillFormUnlocked(ctx: FillContext, photos: Photo[], style: ListingStyle): Promise<FillReport> {
  const say = ctx.status ?? (() => {});
  const failed = (key: string) => (e: unknown) => {
    ctx.log?.(`${key}: Fehler ${e instanceof Error ? e.message : String(e)}`);
    return null;
  };
  const catTrigger = ctx.map.fields.category ? locateField(ctx.map.fields.category, ctx.doc) : null;
  const brandTrigger = ctx.map.fields.brand ? locateField(ctx.map.fields.brand, ctx.doc) : null;

  say("Erkenne Marke, Größe und Zustand …");
  const { result } = await ctx.ai.analyze({ photos, style, categoryOptions: [] });
  const { attributes: a, text } = result;
  const filled: FieldKey[] = [];
  const unresolved: Unresolved[] = [];
  const done = (k: FieldKey, ok: boolean, value: string) => {
    if (ok) filled.push(k);
    else if (value) unresolved.push({ key: k, label: FIELD_LABEL[k], value });
  };

  say("Fülle Titel und Beschreibung …");
  done("title", await fillText(ctx, "title", text.title), text.title);
  const desc = descriptionWithHashtags(text);
  done("description", await fillText(ctx, "description", desc), desc);
  const price = String(suggestedPrice(a));
  done("price", await fillText(ctx, "price", price), price);

  // Vinted usually detects category and brand from title/description – wait for it first.
  say("Warte auf Vinteds Vorschlag für Kategorie und Marke …");
  // Already set before (by Vinted or the user) counts too: Thrift never overwrites it.
  const both = () => looksSet(catTrigger) && (looksSet(brandTrigger) || !a.brand);
  await waitUntil(both, ctx.vintedWaitMs ?? 5000);
  const catByVinted = looksSet(catTrigger);
  const brandByVinted = looksSet(brandTrigger);
  ctx.log?.(
    `Vinted: Kategorie ${catByVinted ? `„${displayedValue(catTrigger!)}“` : "nicht erkannt"}, Marke ${
      brandByVinted ? `„${displayedValue(brandTrigger!)}“` : "nicht erkannt"
    }`,
  );

  const attrs = a;
  // Vinted's own category is kept only if it agrees with the analysis of the photos
  // (Vinted suggested a skirt for shorts); otherwise Thrift picks the category itself.
  const shownCat = catTrigger ? displayedValue(catTrigger).trim() : "";
  const vintedAgrees = catByVinted && sameKind(shownCat, [a.itemType, ...a.categoryPath]);
  let catEl = catTrigger;
  if (vintedAgrees) filled.push("category");
  else {
    if (catByVinted) ctx.log?.(`category: Vinted „${shownCat}“ passt nicht zur Analyse „${a.itemType}“ – wähle neu`);
    say("Wähle Kategorie …");
    catEl = catTrigger ?? (await resolve(ctx, "category"));
    const cat = catEl ? await fillCategory(ctx, a, catEl).catch(failed("category")) : null;
    done("category", !!cat, a.categoryPath.join(" › "));
  }
  const categorySet = filled.includes("category") || looksSet(catEl);

  // Brand, size, condition, colour, material and extra fields only exist once a category is set.
  const lang = style.language;
  const steps: Array<[ChooseField, string | null]> = [
    ["size", attrs.size],
    ["condition", CONDITION_LABELS[attrs.condition][lang]],
    ["color", attrs.colors[0] ?? null],
  ];
  if (attrs.material) steps.push(["material", attrs.material]);
  if (!categorySet) {
    ctx.log?.("Keine Kategorie gesetzt – Marke, Größe, Zustand, Farbe, Material erscheinen erst danach");
    if (attrs.brand) unresolved.push({ key: "brand", label: FIELD_LABEL.brand, value: attrs.brand });
    for (const [key, want] of steps) {
      unresolved.push({ key, label: FIELD_LABEL[key], value: want ?? (key === "size" ? "Größe nicht erkannt – bitte auswählen" : "") });
    }
  } else {
    say("Warte auf die Felder zur Kategorie …");
    const sizeSpec = ctx.map.fields.size;
    await waitUntil(() => !!(sizeSpec && locateField(sizeSpec, ctx.doc)), 3000);

    // Brand: Vinted's detection first; otherwise search it and take only an exact match.
    if (looksSet(brandTrigger ?? (ctx.map.fields.brand ? locateField(ctx.map.fields.brand, ctx.doc) : null))) filled.push("brand");
    else if (attrs.brand) {
      say("Wähle Marke …");
      const chosen = await fillList(ctx, "brand", attrs, attrs.brand).catch(failed("brand"));
      done("brand", !!chosen, attrs.brand);
    }

    say("Wähle Größe, Zustand, Farbe …");
    for (const [key, want] of steps) {
      if (key === "size" && !want) {
        unresolved.push({ key, label: FIELD_LABEL[key], value: "Größe nicht erkannt – bitte auswählen" });
        continue;
      }
      const chosen = await fillList(ctx, key, attrs, want).catch(failed(key));
      done(key, !!chosen, want ?? "");
    }

    await fillExtraFields(ctx, attrs).catch(failed("extra"));
  }

  say(unresolved.length ? "Fertig – bitte markierte Felder prüfen" : "Fertig – bitte prüfen und selbst hochladen");
  return { filled, unresolved: unresolved.filter((u) => u.value), attributes: attrs, text };
}

/** Language/tone change or "Neu schreiben": text only, no photos sent again. */
export async function rewriteText(ctx: FillContext, attributes: Attributes, style: ListingStyle): Promise<ListingText> {
  const { result } = await ctx.ai.rewrite({ attributes, style });
  await fillText(ctx, "title", result.title);
  await fillText(ctx, "description", descriptionWithHashtags(result));
  return result;
}

/**
 * True if the trigger shows exactly this value as one of its items ("Strickjacken", "Beige, Blau",
 * "Damen › … › Strickpullover"). Exact per item, so a placeholder like "Wähle eine Größe" never counts as "L".
 */
export function hasValue(el: Element | null, value: string): boolean {
  if (!el) return false;
  const want = norm(value);
  return !!want && norm(displayedValue(el)).split(/\s*[,›>]\s*/).includes(want);
}

/** True if a picker trigger now shows the chosen value (used by tests and UI). */
export function showsValue(el: Element | null, value: string): boolean {
  return !!el && norm(displayedValue(el)).includes(norm(value));
}
