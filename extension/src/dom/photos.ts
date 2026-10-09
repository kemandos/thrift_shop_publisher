import type { FormMap, Photo } from "@thrift/shared";
import { locateBy } from "./locate";
import { isVisible } from "./core";

const MAX_EDGE = 1280;
const MAX_PHOTOS = 6;

/** Files the user picked in Vinted's photo input (captured in the capture phase, originals). */
const captured: File[] = [];

export function installFileCapture(doc: Document): void {
  doc.addEventListener(
    "change",
    (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === "file" && t.files) {
        for (const f of Array.from(t.files)) if (f.type.startsWith("image/")) captured.push(f);
      }
    },
    true,
  );
}

export function capturedFiles(): File[] {
  return captured.slice();
}

/** The container of Vinted's photo area (input[type=file] or the "Fotos" heading). */
export function photoSection(doc: Document, map: FormMap): Element | null {
  for (const s of map.photos.locate) {
    const anchor = locateBy(s, doc);
    if (!anchor) continue;
    // Walk up to the nearest container that holds preview images; else a container a few levels up.
    let c: Element | null = anchor;
    let fallback: Element | null = null;
    for (let d = 0; c && d < 6; d++, c = c.parentElement) {
      if (c.querySelector("img")) return c;
      if (d === 3) fallback = c;
    }
    if (fallback) return fallback;
  }
  return null;
}

/** Preview images currently shown in Vinted's photo area, in display order. */
export function previewImages(doc: Document, map: FormMap): HTMLImageElement[] {
  const section = photoSection(doc, map);
  if (!section) return [];
  return Array.from(section.querySelectorAll("img")).filter(
    (img) => isVisible(img) && /^(blob:|data:image|https?:)/.test(img.currentSrc || img.src) && !img.closest("[data-thrift-ui]"),
  );
}

export function hasPhotos(doc: Document, map: FormMap): boolean {
  return previewImages(doc, map).length > 0 || captured.length > 0;
}

async function toJpegBase64(blob: Blob): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  let out: Blob;
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(w, h);
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    out = await c.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  } else {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    out = await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("toBlob failed"))), "image/jpeg", 0.85));
  }
  bmp.close?.();
  // Re-encoding through canvas drops EXIF/GPS metadata.
  const buf = new Uint8Array(await out.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Collects up to 6 photos (downscaled JPEG, no metadata). Prefers preview order, falls back to captured files. */
export async function collectPhotos(doc: Document, map: FormMap): Promise<Photo[]> {
  const blobs: Blob[] = [];
  for (const img of previewImages(doc, map).slice(0, MAX_PHOTOS)) {
    try {
      const res = await fetch(img.currentSrc || img.src);
      if (res.ok) blobs.push(await res.blob());
    } catch {
      /* cross-origin preview without CORS – fall back to captured files */
    }
  }
  if (!blobs.length) blobs.push(...captured.slice(0, MAX_PHOTOS));
  const photos: Photo[] = [];
  for (const b of blobs) photos.push({ mediaType: "image/jpeg", data: await toJpegBase64(b) });
  return photos;
}
