import { z } from "zod";

export const LANGUAGES = ["de", "en"] as const;
export const Language = z.enum(LANGUAGES);
export type Language = z.infer<typeof Language>;

export const LANGUAGE_LABELS: Record<Language, string> = { de: "Deutsch", en: "English" };

export const TONES = ["sachlich", "freundlich", "locker", "hochwertig"] as const;
export const Tone = z.enum(TONES);
export type Tone = z.infer<typeof Tone>;

export const TONE_LABELS: Record<Tone, string> = {
  sachlich: "Sachlich",
  freundlich: "Freundlich",
  locker: "Locker",
  hochwertig: "Hochwertig",
};

/** Vinted's condition scale, best to worst. */
export const CONDITIONS = [
  "neu_mit_etikett",
  "neu_ohne_etikett",
  "sehr_gut",
  "gut",
  "zufriedenstellend",
] as const;
export const Condition = z.enum(CONDITIONS);
export type Condition = z.infer<typeof Condition>;

export const CONDITION_LABELS: Record<Condition, { de: string; en: string }> = {
  neu_mit_etikett: { de: "Neu mit Etikett", en: "New with tags" },
  neu_ohne_etikett: { de: "Neu ohne Etikett", en: "New without tags" },
  sehr_gut: { de: "Sehr gut", en: "Very good" },
  gut: { de: "Gut", en: "Good" },
  zufriedenstellend: { de: "Zufriedenstellend", en: "Satisfactory" },
};

export const Photo = z.object({
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  /** Base64 without data: prefix. */
  data: z.string().min(1),
});
export type Photo = z.infer<typeof Photo>;

export const MAX_CUSTOM_INSTRUCTIONS = 400;

export const ListingStyle = z.object({
  language: Language,
  tone: Tone,
  /** Appended verbatim to the description, may be empty. */
  closingText: z.string().max(500).default(""),
  /**
   * The seller's own wishes for the wording (e.g. "always mention: smoke-free home"). Only shapes
   * title/description/hashtags; never a task of its own (see prompts.ts).
   */
  customInstructions: z.string().max(MAX_CUSTOM_INSTRUCTIONS).default(""),
});
export type ListingStyle = z.infer<typeof ListingStyle>;

/** Facts extracted from the photos. Never contains guessed size/brand. */
export const Attributes = z.object({
  itemType: z.string().describe("Kind of garment in the listing language, e.g. 'Strickpullover'"),
  categoryPath: z
    .array(z.string())
    .describe("Best guess of the category path, first element MUST be one of the offered top-level options"),
  brand: z.string().nullable().describe("Brand only if a logo/label/tag shows it, else null"),
  brandEvidence: z.enum(["label", "logo", "none"]),
  size: z.string().nullable().describe("Size exactly as printed on a size label, else null"),
  sizeEvidence: z.enum(["label", "none"]),
  colors: z.array(z.string()).max(3).describe("Main colours in the listing language"),
  material: z.string().nullable().describe("Material only if a care label shows it, else null"),
  condition: Condition,
  defects: z.array(z.string()).describe("Visible defects in the listing language, empty if none"),
  priceMinEur: z.number().int().min(1),
  priceMaxEur: z.number().int().min(1),
});
export type Attributes = z.infer<typeof Attributes>;

export const ListingText = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10).max(3000),
  hashtags: z.array(z.string()).max(10),
});
export type ListingText = z.infer<typeof ListingText>;

export const AnalyzeRequest = z.object({
  photos: z.array(Photo).min(1).max(6),
  style: ListingStyle,
  /** Top-level category options currently offered by Vinted's form, may be empty if unknown. */
  categoryOptions: z.array(z.string()).max(60).default([]),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequest>;

export const AnalyzeResult = z.object({
  attributes: Attributes,
  text: ListingText,
});
export type AnalyzeResult = z.infer<typeof AnalyzeResult>;

export const RewriteRequest = z.object({
  attributes: Attributes,
  style: ListingStyle,
});
export type RewriteRequest = z.infer<typeof RewriteRequest>;

/** Pick one option label for a form field (size, condition, colour, category level, brand). */
export const ChooseRequest = z.object({
  field: z.enum(["category", "size", "condition", "color", "brand", "material"]),
  attributes: Attributes,
  /** For category: the path chosen so far. */
  pathSoFar: z.array(z.string()).default([]),
  options: z.array(z.string().max(120)).min(1).max(300),
});
export type ChooseRequest = z.infer<typeof ChooseRequest>;

export const ChooseResult = z.object({
  /** Exactly one of the offered option labels, or null if none fits. */
  choice: z.string().nullable(),
});
export type ChooseResult = z.infer<typeof ChooseResult>;

export const PageElement = z.object({
  id: z.string(),
  role: z.string(),
  label: z.string(),
  text: z.string(),
});
export type PageElement = z.infer<typeof PageElement>;

/** Jev-style fallback: let the model choose an element from a compact page snapshot. */
export const PickElementRequest = z.object({
  goal: z.string().max(300),
  elements: z.array(PageElement).min(1).max(150),
});
export type PickElementRequest = z.infer<typeof PickElementRequest>;

export const PickElementResult = z.object({
  id: z.string().nullable(),
});
export type PickElementResult = z.infer<typeof PickElementResult>;

export const Usage = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  /** Exact cost reported by the provider (OpenRouter), if any. */
  costUsd: z.number().nonnegative().optional(),
});
export type Usage = z.infer<typeof Usage>;

/** Every AI response carries usage so the client can show cost. */
export const withUsage = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ result: schema, usage: Usage });
