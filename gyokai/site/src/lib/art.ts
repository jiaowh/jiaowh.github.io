// GYOKAI — Acid Pop Archive
// Shared builder for responsive artwork <picture> elements from manifest
// entries. URLs follow the pipeline contract (design-system.md §8):
// /art/<id>-<width>.<avif|webp>. The blurred manifest placeholder is
// painted as a background so lazy posters are never a hard hole.

import type { ArtworkManifestEntry } from "./types";

export interface ArtPictureOptions {
  /** `sizes` attribute for the <img>. */
  sizes: string;
  /** Hero/LCP art is eager + high priority; everything else lazy. */
  eager?: boolean;
  /** Override alt (default: manifest alt). Empty string = decorative. */
  alt?: string;
}

// Public-dir URLs built at runtime must go through BASE_URL — the site is
// deployed under a subpath (GitHub Pages), so root-absolute "/art/…" 404s.
const ART_BASE = `${import.meta.env.BASE_URL}art/`;

function srcset(entry: ArtworkManifestEntry, format: "avif" | "webp"): string {
  return entry.sources[format].map((w) => `${ART_BASE}${entry.id}-${w}.${format} ${w}w`).join(", ");
}

export function artUrl(entry: ArtworkManifestEntry, width: number, format: "avif" | "webp"): string {
  return `${ART_BASE}${entry.id}-${width}.${format}`;
}

export function buildPicture(entry: ArtworkManifestEntry, opts: ArtPictureOptions): HTMLPictureElement {
  const picture = document.createElement("picture");

  const avif = document.createElement("source");
  avif.type = "image/avif";
  avif.srcset = srcset(entry, "avif");
  avif.sizes = opts.sizes;
  picture.appendChild(avif);

  const img = document.createElement("img");
  img.src = artUrl(entry, 960, "webp");
  img.srcset = srcset(entry, "webp");
  img.sizes = opts.sizes;
  img.alt = opts.alt ?? entry.alt;
  img.decoding = "async";
  img.style.aspectRatio = String(entry.aspect);
  img.style.backgroundImage = `url("${entry.placeholder}")`;
  img.style.backgroundSize = "cover";
  if (opts.eager) {
    img.loading = "eager";
    img.setAttribute("fetchpriority", "high");
  } else {
    img.loading = "lazy";
  }
  picture.appendChild(img);

  return picture;
}
