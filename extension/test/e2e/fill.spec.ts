import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addPhotos, routeVinted, STUB_ATTRIBUTES, STUB_TEXT, type FixtureState } from "./helpers";

const harness = readFileSync(fileURLToPath(new URL("./.harness.js", import.meta.url)), "utf8");

async function open(page: Page, variant: string) {
  await routeVinted(page);
  await page.goto(`https://www.vinted.de/items/new?variant=${variant}`);
  await page.addScriptTag({ content: harness });
}

/** Runs the real fill pipeline in the page with a stubbed AI. `pickMode` controls the Jev-style fallback stub. */
async function runFill(page: Page, pickMode: "label" | "none" = "label") {
  return page.evaluate(
    async ({ attributes, text, pickMode }) => {
      const T = (window as any).Thrift;
      const calls: string[] = [];
      const ai = {
        analyze: async (p: any) => {
          calls.push(`analyze:${p.photos.length}:${p.categoryOptions.join("|")}`);
          return { result: { attributes, text }, usage: { inputTokens: 1, outputTokens: 1 } };
        },
        rewrite: async (p: any) => {
          calls.push(`rewrite:${p.style.language}:${"photos" in p}`);
          return { result: { ...text, title: "COS knit sweater beige size M" }, usage: { inputTokens: 1, outputTokens: 1 } };
        },
        choose: async (p: any) => {
          calls.push(`choose:${p.field}`);
          return { result: { choice: p.options[0] ?? null }, usage: { inputTokens: 1, outputTokens: 1 } };
        },
        pickElement: async (p: any) => {
          calls.push(`pick:${p.goal.match(/"([^"]+)"/)?.[1]}`);
          if (pickMode === "none") return { result: { id: null }, usage: { inputTokens: 1, outputTokens: 1 } };
          const want: Record<string, string> = { Kategorie: "Rubrik", Zustand: "Artikelzustand" };
          const key = p.goal.match(/"([^"]+)"/)?.[1] ?? "";
          const hit = p.elements.find((e: any) => e.label === want[key]);
          return { result: { id: hit?.id ?? null }, usage: { inputTokens: 1, outputTokens: 1 } };
        },
      };
      const ctx = { doc: document, map: T.DEFAULT_FORM_MAP, ai, pace: T.pacer(0, 0) };
      const photos = await T.collectPhotos(document, T.DEFAULT_FORM_MAP);
      const report = await T.fillForm(ctx, photos, { language: "de", tone: "freundlich", closingText: "" });
      return { report, calls, photoSizes: photos.map((p: any) => p.data.length), state: (window as any).__state };
    },
    { attributes: STUB_ATTRIBUTES, text: STUB_TEXT, pickMode },
  );
}

function expectFilled(state: FixtureState) {
  expect(state.title).toBe(STUB_TEXT.title);
  expect(state.description).toContain(STUB_TEXT.description);
  expect(state.description).toContain("#cos #strickpullover");
  expect(state.category).toEqual(["Damen", "Kleidung", "Pullover & Sweatshirts", "Strickpullover"]);
  expect(state.brand).toBe("COS");
  expect(state.size).toBe("M");
  expect(state.condition).toBe("Sehr gut");
  expect(state.colors).toEqual(["Beige"]);
  expect(state.price).toBe("19");
  // Never submits, never saves a draft.
  expect(state.submitted).toBe(false);
  expect(state.draft).toBe(false);
}

for (const variant of ["desktop", "mobile"]) {
  test(`fills every field on the ${variant} layout without submitting`, async ({ page }) => {
    if (variant === "mobile") await page.setViewportSize({ width: 390, height: 844 });
    await open(page, variant);
    expect(await page.evaluate(() => (window as any).Thrift.hasPhotos(document, (window as any).Thrift.DEFAULT_FORM_MAP))).toBe(false);
    await addPhotos(page, 3);
    const { report, calls, photoSizes, state } = await runFill(page);
    expectFilled(state);
    expect(report.unresolved).toEqual([]);
    expect(calls[0]).toBe("analyze:3:Damen|Herren|Kinder|Haus");
    // Downscaled to ≤1280 px JPEG: far smaller than a 2000×1500 PNG would be.
    for (const s of photoSizes) expect(s).toBeLessThan(200_000);
  });
}

test("finds renamed fields via AI element picking (Jev-style fallback)", async ({ page }) => {
  await open(page, "broken");
  await addPhotos(page, 1);
  const { state, calls, report } = await runFill(page);
  expect(calls).toContain("pick:Kategorie");
  expect(calls).toContain("pick:Zustand");
  expectFilled(state);
  expect(report.unresolved).toEqual([]);
});

test("offers copy values when neither form map nor AI finds a field", async ({ page }) => {
  await open(page, "broken");
  await addPhotos(page, 1);
  const { state, report } = await runFill(page, "none");
  expect(state.category).toEqual([]);
  expect(state.condition).toBe("");
  expect(report.unresolved.map((u: { key: string }) => u.key).sort()).toEqual(["category", "condition"]);
  expect(state.title).toBe(STUB_TEXT.title);
  expect(state.submitted).toBe(false);
});

test("rewrite changes only the text and does not resend photos", async ({ page }) => {
  await open(page, "desktop");
  await addPhotos(page, 2);
  await runFill(page);
  const res = await page.evaluate(async ({ attributes }) => {
    const T = (window as any).Thrift;
    const calls: string[] = [];
    const ai = {
      rewrite: async (p: any) => {
        calls.push(`rewrite:${p.style.language}:${"photos" in p}`);
        return { result: { title: "COS knit sweater beige size M", description: "Soft COS sweater.", hashtags: ["cos"] }, usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };
    await T.rewriteText({ doc: document, map: T.DEFAULT_FORM_MAP, ai, pace: T.pacer(0, 0) }, attributes, { language: "en", tone: "locker", closingText: "" });
    return { calls, state: (window as any).__state };
  }, { attributes: STUB_ATTRIBUTES });
  expect(res.calls).toEqual(["rewrite:en:false"]);
  expect(res.state.title).toBe("COS knit sweater beige size M");
  expect(res.state.size).toBe("M");
});

test("leaves size empty and flags it when no label was seen", async ({ page }) => {
  await open(page, "desktop");
  await addPhotos(page, 1);
  const out = await page.evaluate(async ({ attributes, text }) => {
    const T = (window as any).Thrift;
    const ai = {
      analyze: async () => ({ result: { attributes: { ...attributes, size: null, sizeEvidence: "none" }, text }, usage: { inputTokens: 1, outputTokens: 1 } }),
      choose: async (p: any) => ({ result: { choice: p.field === "size" ? "L" : p.options[0] }, usage: { inputTokens: 1, outputTokens: 1 } }),
      pickElement: async () => ({ result: { id: null }, usage: { inputTokens: 1, outputTokens: 1 } }),
      rewrite: async () => { throw new Error("unused"); },
    };
    const photos = await T.collectPhotos(document, T.DEFAULT_FORM_MAP);
    const report = await T.fillForm({ doc: document, map: T.DEFAULT_FORM_MAP, ai, pace: T.pacer(0, 0) }, photos, { language: "de", tone: "sachlich", closingText: "" });
    return { report, state: (window as any).__state };
  }, { attributes: STUB_ATTRIBUTES, text: STUB_TEXT });
  expect(out.state.size).toBe("");
  expect(out.report.unresolved).toContainEqual({ key: "size", label: "Größe", value: "Größe nicht erkannt – bitte auswählen" });
});
