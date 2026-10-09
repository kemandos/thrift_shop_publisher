import { chromium, expect, test, type BrowserContext, type Worker } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { addPhotos, routeVinted, STUB_ATTRIBUTES, STUB_TEXT } from "./helpers";

const extPath = fileURLToPath(new URL("../../.output/chrome-mv3-test", import.meta.url));
const TOKEN = "test-token-0123456789abcdef0123";

let server: Server;
let serverUrl = "";
const hits: string[] = [];

test.beforeAll(async () => {
  // Stub of the owner's server (server mode), so no real AI is called.
  server = createServer((req, res) => {
    const url = req.url ?? "";
    hits.push(`${req.method} ${url}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (req.method === "OPTIONS") return res.end();
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "unauthorized" }));
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const usage = { inputTokens: 8000, outputTokens: 800 };
      const json = (o: unknown) => res.end(JSON.stringify(o));
      if (url === "/v1/config") return json({ autofillEnabled: true, formMapVersion: "test" });
      if (url === "/v1/analyze") {
        const p = JSON.parse(body);
        hits.push(`photos:${p.photos.length}`);
        hits.push(`wishes:${p.style.customInstructions ?? ""}`);
        return json({ result: { attributes: STUB_ATTRIBUTES, text: STUB_TEXT }, usage });
      }
      if (url === "/v1/choose") {
        const p = JSON.parse(body);
        return json({ result: { choice: p.options[0] }, usage: { inputTokens: 100, outputTokens: 10 } });
      }
      if (url === "/v1/pick-element") return json({ result: { id: null }, usage: { inputTokens: 100, outputTokens: 10 } });
      res.statusCode = 404;
      json({ error: "not found" });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  serverUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

test.afterAll(() => server?.close());

async function launch(): Promise<{ ctx: BrowserContext; sw: Worker }> {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "thrift-")), {
    headless: false,
    executablePath: process.env.PW_CHROMIUM_PATH,
    args: ["--headless=new", `--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  // Wait until extension APIs are bound in the worker.
  for (let i = 0; i < 50; i++) {
    // @ts-expect-error chrome is available in the extension service worker
    if ((await sw.evaluate(() => typeof chrome?.storage?.local)) === "object") break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await routeVinted(ctx);
  return { ctx, sw };
}

async function setSettings(sw: Worker, patch: Record<string, unknown>) {
  await sw.evaluate(async (p) => {
    // @ts-expect-error chrome is available in the extension service worker
    await chrome.storage.local.set({ settings: { mode: "server", language: "de", tone: "freundlich", ...p } });
  }, patch);
}

test("panel appears only on the upload page and requires photos", async () => {
  const { ctx } = await launch();
  const page = await ctx.newPage();
  await page.goto("https://www.vinted.de/catalog");
  await page.waitForTimeout(800);
  await expect(page.locator("[data-thrift-ui]")).toHaveCount(0);
  await page.goto("https://www.vinted.de/items/new");
  const fill = page.getByTestId("thrift-fill");
  await expect(fill).toBeVisible();
  await expect(fill).toBeDisabled();
  await expect(page.getByText("Erst Fotos hinzufügen")).toBeVisible();
  await addPhotos(page, 1);
  await expect(fill).toBeEnabled();
  await ctx.close();
});

test("first fill shows the notice; after 'Verstanden' it fills everything via the server and never uploads", async () => {
  test.setTimeout(120_000); // real human pacing + waiting for Vinted's own detection
  const { ctx, sw } = await launch();
  await setSettings(sw, { serverUrl, serverToken: TOKEN, noticeAccepted: false });
  const page = await ctx.newPage();
  await page.goto("https://www.vinted.de/items/new");
  await addPhotos(page, 2);
  await page.getByTestId("thrift-fill").click();
  await expect(page.getByTestId("thrift-notice")).toBeVisible();
  expect(hits.filter((h) => h.includes("/v1/analyze"))).toHaveLength(0);
  await page.getByTestId("thrift-notice-ok").click();
  await expect(page.getByTestId("thrift-notice")).toBeHidden();
  // Own instruction, right next to "Ausfüllen", sent with this fill.
  await page.getByTestId("thrift-instructions").fill("Erwähne: Nichtraucherhaushalt");
  await page.getByTestId("thrift-fill").click();
  await expect(page.getByText("Fertig – bitte prüfen und selbst hochladen")).toBeVisible({ timeout: 60_000 });
  const state = await page.evaluate(() => (window as any).__state);
  expect(state).toMatchObject({
    title: STUB_TEXT.title,
    brand: "COS",
    size: "M",
    condition: "Sehr gut",
    colors: ["Beige"],
    price: "19",
    submitted: false,
    draft: false,
  });
  expect(state.category).toEqual(["Damen", "Kleidung", "Pullover & Sweatshirts", "Strickpullover"]);
  expect(hits).toContain("photos:2");
  expect(hits).toContain("wishes:Erwähne: Nichtraucherhaushalt");
  // The instruction is remembered for the next item.
  const saved = await sw.evaluate(async () => {
    // @ts-expect-error chrome is available in the extension service worker
    return (await chrome.storage.local.get("settings")).settings.customPrompt;
  });
  expect(saved).toBe("Erwähne: Nichtraucherhaushalt");
  await expect(page.getByTestId("thrift-rewrite")).toBeVisible();
  // The fill log can be copied for troubleshooting.
  await expect(page.getByTestId("thrift-log")).toBeVisible();
  if (process.env.THRIFT_SHOTS) await page.screenshot({ path: `${process.env.THRIFT_SHOTS}/panel-after-fill.png` });
  await ctx.close();
});

test("shows a clear error when the server token is wrong", async () => {
  const { ctx, sw } = await launch();
  await setSettings(sw, { serverUrl, serverToken: "wrong-token", noticeAccepted: true });
  const page = await ctx.newPage();
  await page.goto("https://www.vinted.de/items/new");
  await addPhotos(page, 1);
  await page.getByTestId("thrift-fill").click();
  await expect(page.getByText("Server-Token ungültig – bitte in den Einstellungen prüfen.")).toBeVisible({ timeout: 15_000 });
  const state = await page.evaluate(() => (window as any).__state);
  expect(state.title).toBe("");
  await ctx.close();
});

test("options page: language/tone are lists, key is stored masked, popup opens the sell page", async () => {
  const { ctx, sw } = await launch();
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/options.html`);
  await expect(page.locator("input[name=language]")).toHaveCount(2);
  await expect(page.locator("#languages")).toHaveText(/Deutsch\s*English/);
  await expect(page.locator("input[name=tone]")).toHaveCount(4);
  await expect(page.locator("input[name=mode][value=openrouter]")).toBeChecked();
  await expect(page.locator("input[name=model][value='anthropic/claude-haiku-5.5']")).toBeChecked();
  await expect(page.locator("input[name=navModel][value='typesafe/jev-router']")).toBeChecked();
  await expect(page.locator("input[name=model]")).toHaveCount(2);
  await page.locator("input[name=model][value='typesafe/jev-router']").check();
  await page.fill("#apiKey", "sk-or-test-key-3fA9");
  await page.locator("input[name=language][value=en]").check();
  await expect(page.locator("#customPrompt")).toHaveCount(0); // own instruction lives in the panel
  await expect(page.locator("#closingTextDe")).toHaveCount(0); // closing text removed
  await page.click("#save");
  await expect(page.locator("#apiKeyMasked")).toHaveText("Gespeichert: ••••••••3fA9");
  await expect(page.locator("#apiKey")).toHaveValue("");
  const stored = await sw.evaluate(async () => {
    // @ts-expect-error chrome is available in the extension service worker
    return (await chrome.storage.local.get("settings")).settings;
  });
  expect(stored).toMatchObject({
    mode: "openrouter",
    apiKey: "sk-or-test-key-3fA9",
    model: "typesafe/jev-router",
    navModel: "typesafe/jev-router",
    language: "en",
  });

  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await expect(popup.locator("#setup")).toBeHidden();
  await expect(popup.getByText("Artikel verkaufen")).toBeVisible();
  await ctx.close();
});
