import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { addPhotos, routeVinted } from "./helpers";

const extPath = fileURLToPath(new URL("../../.output/chrome-mv3-test", import.meta.url));
const SHOTS = process.env.THRIFT_SHOTS;

/** Window/screen formats the panel must work in (CSS px). */
const FORMATS = [
  { name: "iphone-se", width: 375, height: 667, touch: true },
  { name: "iphone-pro-max", width: 430, height: 932, touch: true },
  { name: "iphone-landscape", width: 852, height: 393, touch: true },
  { name: "ipad-portrait", width: 820, height: 1180, touch: true },
  { name: "ipad-split-third", width: 320, height: 1180, touch: true },
  { name: "ipad-landscape", width: 1180, height: 820, touch: true },
  { name: "mac-small-window", width: 700, height: 520, touch: false },
  { name: "mac-laptop", width: 1440, height: 900, touch: false },
  { name: "mac-wide", width: 2560, height: 1440, touch: false },
] as const;

async function launch(touch: boolean, width: number, height: number): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "thrift-")), {
    headless: false,
    executablePath: process.env.PW_CHROMIUM_PATH,
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
    args: ["--headless=new", `--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  for (let i = 0; i < 50; i++) {
    // @ts-expect-error chrome is available in the extension service worker
    if ((await sw.evaluate(() => typeof chrome?.storage?.local)) === "object") break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await sw.evaluate(async () => {
    // @ts-expect-error chrome is available in the extension service worker
    await chrome.storage.local.set({ settings: { mode: "openrouter", apiKey: "sk-or-test", noticeAccepted: true } });
  });
  await routeVinted(ctx);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto("https://www.vinted.de/items/new?variant=mobile");
  await addPhotos(page, 1);
  await expect(page.getByTestId("thrift-fill")).toBeEnabled();
  return { ctx, page };
}

const box = async (page: Page, id: string) => (await page.getByTestId(id).boundingBox())!;

for (const f of FORMATS) {
  test(`panel fits ${f.name} (${f.width}×${f.height})`, async () => {
    const { ctx, page } = await launch(f.touch, f.width, f.height);
    const vw = await page.evaluate(() => window.innerWidth);
    const vh = await page.evaluate(() => window.innerHeight);

    const card = await box(page, "thrift-panel");
    // Fully on screen, never taller than the window (scrolls inside instead).
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.y).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(vw + 0.5);
    expect(card.y + card.height).toBeLessThanOrEqual(vh + 0.5);

    if (vw < 640) {
      expect(card.width).toBeGreaterThanOrEqual(vw - 16 - 1); // full-width sheet
    } else {
      expect(card.width).toBeCloseTo(360, 0); // floating card
      expect(vw - (card.x + card.width)).toBeGreaterThanOrEqual(15); // at the right edge, with margin
    }

    const fill = await box(page, "thrift-fill");
    if (f.touch) {
      expect(fill.height).toBeGreaterThanOrEqual(44);
      expect((await box(page, "thrift-collapse")).height).toBeGreaterThanOrEqual(44);
      // 16 px text in selects: iOS does not zoom when they get focus.
      const fs = await page.evaluate(() => {
        const host = document.querySelector("[data-thrift-ui]")!;
        return getComputedStyle(host.shadowRoot!.querySelector("select")!).fontSize;
      });
      expect(fs).toBe("16px");
    }
    if (f.height >= 600) await expect(page.getByTestId("thrift-fill")).toBeInViewport({ ratio: 1 });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${f.name}.png` });

    // Collapsed: a small pill that still offers "Ausfüllen"; it stays on screen.
    await page.getByTestId("thrift-collapse").click();
    const pill = await box(page, "thrift-panel");
    expect(pill.width).toBeLessThan(260);
    expect(pill.height).toBeLessThan(80);
    expect(pill.x + pill.width).toBeLessThanOrEqual(vw + 0.5);
    await expect(page.getByTestId("thrift-fill-compact")).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${f.name}-collapsed.png` });
    await ctx.close();
  });
}

test("dock top/bottom and collapsed state are remembered", async () => {
  const { ctx, page } = await launch(true, 390, 844);
  await page.getByTestId("thrift-dock").click();
  const top = await box(page, "thrift-panel");
  expect(top.y).toBeLessThan(40);
  await page.getByTestId("thrift-collapse").click();
  await page.reload();
  await addPhotos(page, 1);
  const after = await box(page, "thrift-panel");
  expect(after.y).toBeLessThan(40);
  await expect(page.getByTestId("thrift-fill-compact")).toBeVisible();
  await expect(page.getByTestId("thrift-fill")).toBeHidden();
  await ctx.close();
});
