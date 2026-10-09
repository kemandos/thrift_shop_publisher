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
async function runFill(
  page: Page,
  pickMode: "label" | "none" | "upload" = "label",
  attrs: Record<string, unknown> = STUB_ATTRIBUTES,
) {
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
          if (pickMode === "upload") {
            // A misbehaving model: tags the Hochladen button and answers with its id, and tries to submit.
            document.getElementById("upload")!.setAttribute("data-thrift-id", "evil");
            document.getElementById("upload")!.click();
            document.querySelector("form")?.requestSubmit?.();
            return { result: { id: "evil" }, usage: { inputTokens: 1, outputTokens: 1 } };
          }
          const want: Record<string, string> = { Kategorie: "Rubrik", Zustand: "Artikelzustand" };
          const key = p.goal.match(/"([^"]+)"/)?.[1] ?? "";
          const hit = p.elements.find((e: any) => e.label === want[key]);
          return { result: { id: hit?.id ?? null }, usage: { inputTokens: 1, outputTokens: 1 } };
        },
      };
      const log: string[] = [];
      const ctx = {
        doc: document,
        map: T.DEFAULT_FORM_MAP,
        ai,
        pace: T.pacer(0, 0),
        vintedWaitMs: 1500,
        log: (l: string) => log.push(l),
      };
      const photos = await T.collectPhotos(document, T.DEFAULT_FORM_MAP);
      const report = await T.fillForm(ctx, photos, { language: "de", tone: "freundlich", closingText: "" });
      return { report, calls, log, photoSizes: photos.map((p: any) => p.data.length), state: (window as any).__state };
    },
    { attributes: attrs, text: STUB_TEXT, pickMode },
  );
}

function expectFilled(state: FixtureState) {
  expect(state.title).toBe(STUB_TEXT.title);
  expect(state.description).toContain(STUB_TEXT.description);
  expect(state.description).toContain("#cos #strickpullover");
  expect(state.category).toEqual(["Damen", "Kleidung", "Pullover & Sweatshirts", "Strickpullover"]);
  expect(state.brand).toBe("COS"); // exact match from the brand search
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
    // No picker is opened before the analysis any more.
    expect(calls[0]).toBe("analyze:3:");
    // Downscaled to ≤1280 px JPEG: far smaller than a 2000×1500 PNG would be.
    for (const s of photoSizes) expect(s).toBeLessThan(200_000);
  });
}

test.describe("vinted.de structure (div rows, search, suggestions)", () => {
  test("keeps category and brand that Vinted detects from the text; never opens the category picker", async ({ page }) => {
    await routeVinted(page);
    await page.goto("https://www.vinted.de/items/new?variant=vinted&autodetect=1");
    await page.addScriptTag({ content: harness });
    await addPhotos(page, 1);
    const { state, report, log } = await runFill(page);
    expect(state.category).toEqual(["Damen", "Kleidung", "Pullover & Sweatshirts", "Strickpullover"]);
    expect(state.brand).toBe("COS");
    expect(report.unresolved).toEqual([]);
    const text = log.join("\n");
    expect(text).toContain("Vinted: Kategorie „Strickpullover“, Marke „COS“");
    expect(text).not.toContain("category: Auswahl geöffnet");
  });

  test("not detected: classifies the category through the tree, ignores a wrong-department suggestion, searches the brand", async ({ page }) => {
    await open(page, "vinted");
    await addPhotos(page, 1);
    const { state, report, log, calls } = await runFill(page);
    expect(state.category).toEqual(["Damen", "Kleidung", "Pullover & Sweatshirts", "Strickpullover"]);
    expect(state.brand).toBe("COS");
    expect(report.unresolved).toEqual([]);
    expect(state.size).toBe("M");
    expect(state.condition).toBe("Sehr gut");
    expect(state.colors).toEqual(["Beige"]);
    expect(state.submitted).toBe(false);
    const text = log.join("\n");
    expect(text).toContain("category: nicht von Vinted gesetzt – klassifiziere selbst");
    expect(text).not.toContain("category: Suche"); // no searching in the category picker
    expect(text).toContain("brand: Suche „COS“");
    expect(calls.filter((c) => c.startsWith("choose:category"))).toEqual([]); // exact path, no AI needed
    expect(text).toContain('placeholder="Wähle eine Größe"');
    // Size grid: shown (not added) on open, help links ignored, tile click retried on the inner text.
    expect(await page.evaluate(() => (window as any).__state.sizeTable)).toBeUndefined();
    expect(text).toMatch(/size: Klick auf div – noch nicht übernommen/);
    expect(text).toMatch(/size: „M“ übernommen \(Klick auf span\)/);
  });

  test("Vinted sets a skirt for shorts: the analysis wins and Thrift picks Shorts through the tree", async ({ page }) => {
    await routeVinted(page);
    await page.goto("https://www.vinted.de/items/new?variant=vinted&autodetect=rock");
    await page.addScriptTag({ content: harness });
    await addPhotos(page, 1);
    const shorts = { ...STUB_ATTRIBUTES, itemType: "Shorts", categoryPath: ["Damen", "Shorts", "Shorts mit hoher Taille"] };
    const { state, log } = await runFill(page, "label", shorts);
    expect(state.category).toEqual(["Damen", "Kleidung", "Shorts", "Shorts mit hoher Taille"]);
    expect(log.join("\n")).toContain("category: Vinted „Miniröcke“ passt nicht zur Analyse „Shorts“ – wähle neu");
    expect(state.size).toBe("M"); // fields after the category still filled
  });

  test("a Vinted suggestion that matches the analysis is taken", async ({ page }) => {
    await routeVinted(page);
    await page.goto("https://www.vinted.de/items/new?variant=vinted&suggest=shorts");
    await page.addScriptTag({ content: harness });
    await addPhotos(page, 1);
    const shorts = { ...STUB_ATTRIBUTES, itemType: "Shorts", categoryPath: ["Damen", "Kleidung", "Shorts", "Shorts mit hoher Taille"] };
    const { state, log } = await runFill(page, "label", shorts);
    expect(state.category).toEqual(["Damen", "Kleidung", "Shorts", "Shorts mit hoher Taille"]);
    expect(log.join("\n")).not.toContain("Ebene 1");
  });

  test("extra fields of the category (Rocklänge) are filled from the analysis", async ({ page }) => {
    await open(page, "vinted");
    await addPhotos(page, 1);
    const skirt = { ...STUB_ATTRIBUTES, itemType: "Minirock", categoryPath: ["Damen", "Kleidung", "Röcke", "Miniröcke"] };
    const { state, calls } = await runFill(page, "label", skirt);
    expect(state.category).toEqual(["Damen", "Kleidung", "Röcke", "Miniröcke"]);
    // "Minirock" → "Mini" directly, without an extra AI call.
    expect(calls).not.toContain("choose:other");
    expect(await page.evaluate(() => (window as any).__state.rockLength)).toBe("Mini");
  });

  test("without a category, the fields that depend on it are left alone (no searching)", async ({ page }) => {
    await open(page, "broken");
    await addPhotos(page, 1);
    const { report, calls } = await runFill(page, "none");
    expect(calls).toContain("pick:Kategorie"); // the category itself may be searched for
    expect(calls).not.toContain("pick:Zustand"); // dependent fields are not
    expect(report.filled).not.toContain("condition");
    expect(report.unresolved.map((u: { key: string }) => u.key)).toEqual(
      expect.arrayContaining(["category", "brand", "size", "condition", "color"]),
    );
  });

  test("brand without an exact match is left for the user (never a similar name)", async ({ page }) => {
    await open(page, "vinted");
    await addPhotos(page, 1);
    const { state, report } = await runFill(page, "label", { ...STUB_ATTRIBUTES, brand: "Cosmo" });
    expect(state.brand).toBe("");
    expect(report.unresolved).toContainEqual({ key: "brand", label: "Marke", value: "Cosmo" });
  });

  test("unknown path: similar names first, the AI only where nothing fits, still ends in a leaf (never stuck)", async ({ page }) => {
    await open(page, "vinted");
    await addPhotos(page, 1);
    const attrs = { ...STUB_ATTRIBUTES, categoryPath: ["Damen", "Oberteile", "Strick"] };
    const started = Date.now();
    const { state, calls } = await runFill(page, "label", attrs);
    expect(Date.now() - started).toBeLessThan(20_000);
    // Damen exact, "Kleidung" by the AI (nothing similar), "Pullover & Sweatshirts" by similarity, then the leaf.
    expect(calls.filter((c) => c === "choose:category")).toHaveLength(1);
    expect(state.category[0]).toBe("Damen");
    expect(state.category.length).toBeGreaterThanOrEqual(3);
  });

  test("category via the tree when there is no search box (rows reused between levels)", async ({ page }) => {
    await routeVinted(page);
    await page.goto("https://www.vinted.de/items/new?variant=vinted&nosearch=1");
    await page.addScriptTag({ content: harness });
    await addPhotos(page, 1);
    const { state } = await runFill(page);
    expect(state.category).toEqual(["Damen", "Kleidung", "Pullover & Sweatshirts", "Strickpullover"]);
  });

  test("keeps a category that was already set before the fill", async ({ page }) => {
    await routeVinted(page);
    await page.goto("https://www.vinted.de/items/new?variant=vinted&preset=Strickpullover");
    await page.addScriptTag({ content: harness });
    await addPhotos(page, 1);
    const { state, log } = await runFill(page);
    expect(state.category).toEqual(["(preset)", "Strickpullover"]);
    expect(log.join("\n")).not.toContain("category: Auswahl geöffnet");
  });
});

test("finds renamed fields via AI element picking (Jev-style fallback)", async ({ page }) => {
  await open(page, "broken");
  await addPhotos(page, 1);
  const { state, calls, report } = await runFill(page);
  expect(calls).toContain("pick:Kategorie");
  expect(calls).toContain("pick:Zustand");
  expectFilled(state);
  expect(report.unresolved).toEqual([]);
});

test("the AI (Jev) can never publish: Hochladen is neither offered, accepted nor clickable during a fill", async ({ page }) => {
  await open(page, "broken");
  await addPhotos(page, 1);
  const { state, report } = await runFill(page, "upload");
  expect(state.submitted).toBe(false);
  expect(state.draft).toBe(false);
  expect(report.unresolved.map((u: { key: string }) => u.key).sort()).toEqual(["brand", "category", "color", "condition", "size"]);
  // After the fill a real human click still works.
  await page.click("#upload");
  expect(await page.evaluate(() => (window as any).__state.submitted)).toBe(true);
});

test("offers copy values when neither form map nor AI finds a field", async ({ page }) => {
  await open(page, "broken");
  await addPhotos(page, 1);
  const { state, report } = await runFill(page, "none");
  expect(state.category).toEqual([]);
  expect(state.condition).toBe("");
  expect(report.unresolved.map((u: { key: string }) => u.key).sort()).toEqual(["brand", "category", "color", "condition", "size"]);
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
