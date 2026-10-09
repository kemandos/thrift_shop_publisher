import type { Attributes, ChooseRequest, ListingStyle, PageElement } from "./schemas";
import { CONDITION_LABELS, LANGUAGE_LABELS } from "./schemas";

const TONE_GUIDE: Record<ListingStyle["tone"], { de: string; en: string }> = {
  sachlich: {
    de: "sachlich und knapp, ohne Ausrufezeichen und ohne Emojis",
    en: "factual and concise, no exclamation marks, no emojis",
  },
  freundlich: {
    de: "freundlich und einladend, höchstens ein Emoji",
    en: "friendly and inviting, at most one emoji",
  },
  locker: {
    de: "locker und jung, du-Form, gern ein bis zwei passende Emojis",
    en: "casual and youthful, one or two fitting emojis are fine",
  },
  hochwertig: {
    de: "hochwertig und elegant wie ein Boutique-Text, keine Emojis",
    en: "premium and elegant like a boutique description, no emojis",
  },
};

export const ANALYZE_SYSTEM = `You prepare second-hand clothing listings for Vinted from the seller's photos.

Rules for facts:
- Report only what the photos show. Never invent facts.
- size: copy it exactly as printed on a size label (e.g. "M", "38", "W30 L32", "128"). If no size label is readable, size = null and sizeEvidence = "none".
- brand: only from a readable logo, label or tag. Otherwise brand = null and brandEvidence = "none".
- material: only from a readable care/composition label, otherwise null.
- condition: use Vinted's scale. Any visible defect (stain, hole, pilling, fading) means at most "gut".
- defects: list every visible defect with its location.
- categoryPath: the first element MUST be exactly one of the offered top-level category options (if any are given); further elements are your best guess of the sub-categories.
- price: a realistic second-hand range in whole euros for Vinted Germany.

Rules for the text:
- Title: item type, brand (if known), main colour and size (if known); under 60 characters; no hashtags.
- Description: 2–5 short sentences. Mention size, brand, material, colour and condition when known, and every defect. Never mention a fact that is null/unknown.
- Hashtags: 3–8 lowercase words without '#', relevant for search.`;

export function styleInstruction(style: ListingStyle): string {
  const lang = LANGUAGE_LABELS[style.language];
  const tone = TONE_GUIDE[style.tone][style.language];
  return `Write title, description and hashtags in ${lang}. Tone: ${tone}. All attribute strings (itemType, colors, defects, material) also in ${lang}.`;
}

export function analyzeUserText(style: ListingStyle, categoryOptions: string[]): string {
  const cats = categoryOptions.length
    ? `Offered top-level categories: ${categoryOptions.map((c) => JSON.stringify(c)).join(", ")}.`
    : "No category options were provided; give your best category path.";
  return `These photos show ONE item for sale. ${cats}\n${styleInstruction(style)}`;
}

export const REWRITE_SYSTEM = `You rewrite Vinted listing texts from given facts. Use only the facts provided; do not add new ones. Mention every defect. Never mention unknown (null) facts.
Title under 60 characters with item type, brand (if known), main colour and size (if known). Description 2–5 short sentences. Hashtags: 3–8 lowercase words without '#'.`;

export function rewriteUserText(attributes: Attributes, style: ListingStyle): string {
  return `Facts (JSON):\n${JSON.stringify(attributes, null, 2)}\n\nCondition label: ${CONDITION_LABELS[attributes.condition][style.language]}.\n${styleInstruction(style)}`;
}

export const CHOOSE_SYSTEM = `You map an item's facts to exactly one option of a form field on Vinted. Answer with one option copied character-for-character from the list, or null if no option fits. Never guess a size or brand that is not supported by the facts (null facts mean: answer null).`;

export function chooseUserText(req: ChooseRequest): string {
  const path = req.pathSoFar.length ? `\nCategory path chosen so far: ${req.pathSoFar.join(" › ")}` : "";
  return `Field: ${req.field}${path}\nFacts (JSON):\n${JSON.stringify(req.attributes)}\n\nOptions:\n${req.options
    .map((o) => `- ${o}`)
    .join("\n")}`;
}

export const PICK_SYSTEM = `You help fill a web form. Given a goal and a list of visible interactive elements (id, role, label, text), answer with the id of the single element that best matches the goal, or null if none does. Never choose a submit/upload/publish/save button.`;

export function pickUserText(goal: string, elements: PageElement[]): string {
  return `Goal: ${goal}\n\nElements:\n${elements
    .map((e) => `${e.id} | ${e.role} | ${e.label} | ${e.text}`)
    .join("\n")}`;
}

export function appendClosingText(description: string, closingText: string): string {
  const c = closingText.trim();
  if (!c) return description.trim();
  return `${description.trim()}\n\n${c}`;
}
