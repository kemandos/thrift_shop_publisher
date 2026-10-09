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
import { humanClick, isVisible, norm, setNativeValue, type Pacer } from "../dom/core";
import {
  clearPickerSearch,
  closePicker,
  matchOption,
  nextLevel,
  openPicker,
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
    field: "category" | "size" | "condition" | "color" | "brand" | "material";
    attributes: Attributes;
    pathSoFar?: string[];
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
async function resolve(ctx: FillContext, key: FieldKey): Promise<Element | null> {
  const spec = ctx.map.fields[key];
  if (!spec) return null;
  const el = locateField(spec, ctx.doc);
  if (el) {
    ctx.log?.(`${key}: Feld ${describe(el)}`);
    return el;
  }
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

async function fillText(ctx: FillContext, key: FieldKey, value: string): Promise<boolean> {
  const el = await resolve(ctx, key);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
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
  const direct = matchOption(options, want);
  if (direct) return direct;
  if (field === "brand" || (field === "size" && !attrs.size)) return null; // never guessed
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

/** Clicks a leaf option and confirms the trigger shows it (or the picker closed). */
async function selectLeaf(ctx: FillContext, session: PickerSession, pick: Option): Promise<string[] | null> {
  await ctx.pace.step();
  const ok = await selectOption(ctx, "category", pick, () => hasValue(session.trigger, pick.label));
  ctx.log?.(`category: gewählt „${pick.label}“ (${pick.detail}), Feld zeigt „${displayedValue(session.trigger)}“`);
  if (pick.el.isConnected && isVisible(pick.el)) await closePicker(session.trigger, ctx.doc);
  return ok ? [...pathSegments(pick.detail), pick.label] : null;
}


/** Leaf among several equal candidates: let the AI pick using the full paths. */
async function aiPickPath(ctx: FillContext, attrs: Attributes, tied: Option[]): Promise<Option | null> {
  const labels = tied.map((o) => `${o.label} — ${o.detail}`);
  try {
    const { result } = await ctx.ai.choose({ field: "category", attributes: attrs, options: labels });
    const i = result.choice ? labels.indexOf(result.choice) : -1;
    return i >= 0 ? tied[i]! : null;
  } catch {
    return null;
  }
}

/**
 * Category, like a person would do it:
 * 0. already shown (Vinted pre-selects from the title) → done,
 * 1. a visible suggestion with the right leaf and department → take it,
 * 2. the picker's search box: type the leaf (then the item type) and take the result whose path fits,
 * 3. otherwise walk the tree level by level.
 */
async function fillCategory(ctx: FillContext, attrs: Attributes): Promise<string[] | null> {
  const trigger = await resolve(ctx, "category");
  const want = attrs.categoryPath.filter(Boolean);
  ctx.log?.(`category: gesucht ${want.join(" › ") || "–"}`);
  if (!trigger) {
    ctx.log?.("category: Feld nicht gefunden");
    return null;
  }
  const leaf = want.at(-1);
  if (leaf && hasValue(trigger, leaf)) {
    ctx.log?.(`category: bereits gesetzt („${displayedValue(trigger)}“)`);
    return want;
  }
  return withPicker(ctx, "category", trigger, async (session) => {
    // 1. Suggestion / visible leaf.
    const visible = pickByPath(session.options, want);
    if (visible.pick) return selectLeaf(ctx, session, visible.pick);

    // 2. Search.
    for (const query of [leaf, attrs.itemType].filter((q): q is string => !!q)) {
      const results = await searchInPicker(ctx.doc, session, query, ctx.pace);
      if (!results) break; // no search box
      ctx.log?.(`category: Suche „${query}“: ${optionList(results)}`);
      const path = query === leaf ? want : [...want.slice(0, -1), query];
      const { pick, tied } = pickByPath(results, path);
      const chosen = pick ?? (tied.length ? await aiPickPath(ctx, attrs, tied) : null);
      if (chosen) return selectLeaf(ctx, session, chosen);
    }
    await clearPickerSearch(ctx.doc, session, ctx.pace);

    // 3. Tree.
    let options = session.scan().length ? session.scan() : session.options;
    const forbidden = ctx.map.forbiddenClickText;
    const path: string[] = [];
    for (let level = 0; options.length && level < 7; level++) {
      let pick = matchOption(options, want[level]);
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
      }
      if (!pick) {
        ctx.log?.(`category: Ebene ${level + 1} ohne Treffer: ${optionList(options)}`);
        break;
      }
      await ctx.pace.step();
      await humanClick(pick.el, forbidden, ctx.pace);
      path.push(pick.label);
      await ctx.pace.step();
      const next = await nextLevel(session, options);
      if (next === null) {
        ctx.log?.(`category: Baum gewählt ${path.join(" › ")}, Feld zeigt „${displayedValue(trigger)}“`);
        return path; // leaf selected, picker closed
      }
      options = next;
    }
    if (path.length) await closePicker(trigger, ctx.doc);
    return null;
  });
}

/** Reads the top-level category options (opens and closes the picker). */
export async function readCategoryOptions(ctx: FillContext): Promise<string[]> {
  const spec = ctx.map.fields.category;
  if (!spec) return [];
  const trigger = locateField(spec, ctx.doc);
  if (!trigger) return [];
  const session = await openPicker(trigger, ctx.doc, ctx.map.forbiddenClickText, ctx.pace, 1500);
  session.dispose();
  await closePicker(trigger, ctx.doc);
  await ctx.pace.step();
  // Only the department rows (no path line); suggestions carry a path.
  return session.options.filter((o) => !o.detail).map((o) => o.label).slice(0, 60);
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

async function fillFormUnlocked(ctx: FillContext, photos: Photo[], style: ListingStyle): Promise<FillReport> {
  const say = ctx.status ?? (() => {});
  say("Lese Kategorien …");
  const categoryOptions = await readCategoryOptions(ctx).catch(() => [] as string[]);
  say("Erkenne Marke, Größe und Zustand …");
  const { result } = await ctx.ai.analyze({ photos, style, categoryOptions });
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

  say("Wähle Kategorie …");
  const failed = (key: string) => (e: unknown) => {
    ctx.log?.(`${key}: Fehler ${e instanceof Error ? e.message : String(e)}`);
    return null;
  };
  const cat = await fillCategory(ctx, a).catch(failed("category"));
  done("category", !!cat, a.categoryPath.join(" › "));

  say("Wähle Marke, Größe, Zustand, Farbe …");
  const lang = style.language;
  const steps: Array<[ChooseField, string | null]> = [
    ["brand", a.brand],
    ["size", a.size],
    ["condition", CONDITION_LABELS[a.condition][lang]],
    ["color", a.colors[0] ?? null],
  ];
  if (a.material) steps.push(["material", a.material]);
  for (const [key, want] of steps) {
    if ((key === "brand" || key === "size") && !want) {
      unresolved.push({ key, label: FIELD_LABEL[key], value: key === "size" ? "Größe nicht erkannt – bitte auswählen" : "" });
      continue;
    }
    const chosen = await fillList(ctx, key, a, want).catch(failed(key));
    done(key, !!chosen, want ?? "");
  }

  say("Setze Preis …");
  const price = String(suggestedPrice(a));
  done("price", await fillText(ctx, "price", price), price);

  say(unresolved.length ? "Fertig – bitte markierte Felder prüfen" : "Fertig – bitte prüfen und selbst hochladen");
  return { filled, unresolved: unresolved.filter((u) => u.value), attributes: a, text };
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
