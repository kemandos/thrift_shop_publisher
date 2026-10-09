import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
export const FIXTURE = readFileSync(`${here}../fixtures/upload.html`, "utf8");

/** Serves the fixture for https://www.vinted.de/items/new* and a plain page elsewhere on vinted.de. */
export async function routeVinted(target: Pick<Page, "route">) {
  await target.route("https://www.vinted.de/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/items/new")) return route.fulfill({ contentType: "text/html", body: FIXTURE });
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><h1>Katalog</h1>" });
  });
}

/** Adds n generated photos to the fixture's photo area. */
export async function addPhotos(page: Page, n: number) {
  await page.evaluate(async (count) => {
    for (let i = 0; i < count; i++) {
      const c = document.createElement("canvas");
      c.width = 2000;
      c.height = 1500;
      const g = c.getContext("2d")!;
      g.fillStyle = ["#d6c8b0", "#7f96b2", "#e4c7be"][i % 3]!;
      g.fillRect(0, 0, 2000, 1500);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
      (window as unknown as { __addPhoto: (b: Blob) => void }).__addPhoto(blob);
    }
  }, n);
}

export const STUB_ATTRIBUTES = {
  itemType: "Strickpullover",
  categoryPath: ["Damen", "Kleidung", "Pullover & Sweatshirts", "Strickpullover"],
  brand: "COS",
  brandEvidence: "label",
  size: "M",
  sizeEvidence: "label",
  colors: ["Beige"],
  material: null,
  condition: "sehr_gut",
  defects: [],
  priceMinEur: 15,
  priceMaxEur: 22,
};

export const STUB_TEXT = {
  title: "COS Strickpullover beige Gr. M",
  description: "Weicher Strickpullover von COS in Beige, Größe M. Sehr guter Zustand.",
  hashtags: ["cos", "strickpullover"],
};

export type FixtureState = {
  title: string;
  description: string;
  price: string;
  category: string[];
  brand: string;
  size: string;
  condition: string;
  colors: string[];
  submitted: boolean;
  draft: boolean;
};
