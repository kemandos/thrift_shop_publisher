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
import { isVisible, norm, safeClick, setNativeValue, type Pacer } from "../dom/core";
import { closePicker, matchOption, nextLevel, openPicker, searchInPicker, type Option } from "../dom/pickers";
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

export function suggestedPrice(a: Attributes): number {
  return Math.round((a.priceMinEur + a.priceMaxEur) / 2);
}

/** Field → element, with AI element picking as fallback when the form map does not match. */
async function resolve(ctx: FillContext, key: FieldKey): Promise<Element | null> {
  const spec = ctx.map.fields[key];
  if (!spec) return null;
  const el = locateField(spec, ctx.doc);
  if (el) return el;
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

async function fillList(ctx: FillContext, key: ChooseField, attrs: Attributes, want: string | null): Promise<string | null> {
  const trigger = await resolve(ctx, key);
  if (!trigger) return null;
  const forbidden = ctx.map.forbiddenClickText;
  let options = await openPicker(trigger, ctx.doc, forbidden, ctx.pace);
  if (!options.length) return null;
  if (key === "brand" && want) options = await searchInPicker(ctx.doc, want, options, forbidden, ctx.pace);
  const pick = await chooseOption(ctx, key, attrs, options, want);
  if (!pick) {
    await closePicker(trigger, ctx.doc);
    return null;
  }
  safeClick(pick.el, forbidden);
  await ctx.pace.step();
  // Multi-select pickers (e.g. colour) stay open after a click – close them.
  if (pick.el.isConnected && isVisible(pick.el)) await closePicker(trigger, ctx.doc);
  return pick.label;
}

async function fillCategory(ctx: FillContext, attrs: Attributes): Promise<string[] | null> {
  const trigger = await resolve(ctx, "category");
  if (!trigger) return null;
  const forbidden = ctx.map.forbiddenClickText;
  let options = await openPicker(trigger, ctx.doc, forbidden, ctx.pace);
  const path: string[] = [];
  for (let level = 0; options.length && level < 7; level++) {
    let pick = matchOption(options, attrs.categoryPath[level]);
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
    if (!pick) break;
    safeClick(pick.el, forbidden);
    path.push(pick.label);
    await ctx.pace.step();
    const next = await nextLevel(pick, options, ctx.doc, forbidden);
    if (next === null) return path; // leaf selected, picker closed
    options = next;
  }
  if (path.length) await closePicker(trigger, ctx.doc);
  return path.length ? path : null;
}

/** Reads the top-level category options (opens and closes the picker). */
export async function readCategoryOptions(ctx: FillContext): Promise<string[]> {
  const spec = ctx.map.fields.category;
  if (!spec) return [];
  const trigger = locateField(spec, ctx.doc);
  if (!trigger) return [];
  const opts = await openPicker(trigger, ctx.doc, ctx.map.forbiddenClickText, ctx.pace, 1500);
  await closePicker(trigger, ctx.doc);
  await ctx.pace.step();
  return opts.map((o) => o.label).slice(0, 60);
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
  const cat = await fillCategory(ctx, a).catch(() => null);
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
    const chosen = await fillList(ctx, key, a, want).catch(() => null);
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

/** True if a picker trigger now shows the chosen value (used by tests and UI). */
export function showsValue(el: Element | null, value: string): boolean {
  return !!el && norm(displayedValue(el)).includes(norm(value));
}
