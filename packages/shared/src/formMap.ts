import { z } from "zod";

export const FIELD_KEYS = [
  "title",
  "description",
  "category",
  "brand",
  "size",
  "condition",
  "color",
  "material",
  "price",
] as const;
export const FieldKey = z.enum(FIELD_KEYS);
export type FieldKey = z.infer<typeof FieldKey>;

export const Strategy = z.object({
  by: z.enum(["testid", "label", "placeholder", "name", "css"]),
  value: z.string().min(1),
});
export type Strategy = z.infer<typeof Strategy>;

export const FieldType = z.enum(["text", "textarea", "price", "picker-tree", "picker-list", "search-select"]);
export type FieldType = z.infer<typeof FieldType>;

export const FieldSpec = z.object({
  type: FieldType,
  required: z.boolean(),
  locate: z.array(Strategy).min(1),
});
export type FieldSpec = z.infer<typeof FieldSpec>;

export const FormMap = z.object({
  version: z.string(),
  /** Pages the content script runs on (path prefixes). */
  paths: z.array(z.string()).min(1),
  fields: z.record(FieldKey, FieldSpec),
  photos: z.object({ locate: z.array(Strategy).min(1) }),
  /** The extension must never click elements whose text matches any of these (case-insensitive). */
  forbiddenClickText: z.array(z.string()).min(1),
});
export type FormMap = z.infer<typeof FormMap>;

const L = (value: string): Strategy => ({ by: "label", value });
const T = (value: string): Strategy => ({ by: "testid", value });
const P = (value: string): Strategy => ({ by: "placeholder", value });

/**
 * Initial map. Labels come from vinted.de's "Artikel verkaufen" page (verified on iPhone Safari,
 * 2026-10-09: "Fotos", "Titel", "Beschreibung"). test-ids are best guesses and are tried first;
 * label/placeholder strategies and the AI element picker cover mismatches. Update after task 1.3.
 */
export const DEFAULT_FORM_MAP: FormMap = {
  version: "2026-10-09.1",
  paths: ["/items/new"],
  fields: {
    title: { type: "text", required: true, locate: [T("title--input"), P("Teile Käufern mit"), L("Titel"), L("Title")] },
    description: {
      type: "textarea",
      required: true,
      locate: [T("description--input"), P("Erzähle Käufern"), L("Beschreibung"), L("Description")],
    },
    category: { type: "picker-tree", required: true, locate: [T("catalog-select-dropdown-input"), L("Kategorie"), L("Category")] },
    brand: { type: "search-select", required: false, locate: [T("brand-select-dropdown-input"), L("Marke"), L("Brand")] },
    size: { type: "picker-list", required: false, locate: [T("size-select-dropdown-input"), L("Größe"), L("Size")] },
    condition: { type: "picker-list", required: true, locate: [T("status-select-dropdown-input"), L("Zustand"), L("Condition")] },
    color: { type: "picker-list", required: false, locate: [T("color-select-dropdown-input"), L("Farbe"), L("Colour"), L("Color")] },
    material: { type: "picker-list", required: false, locate: [T("material-select-dropdown-input"), L("Material")] },
    price: { type: "price", required: true, locate: [T("price-input--input"), L("Preis"), L("Price")] },
  },
  photos: { locate: [{ by: "css", value: "input[type=file]" }, L("Fotos"), L("Photos")] },
  forbiddenClickText: [
    "hochladen",
    "upload",
    "veröffentlichen",
    "publish",
    "speichern",
    "save",
    "entwurf",
    "draft",
    "löschen",
    "delete",
    "submit",
  ],
};
