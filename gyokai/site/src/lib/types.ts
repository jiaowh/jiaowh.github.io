// GYOKAI — Acid Pop Archive — shared types
// Mirrors the shape emitted by scripts/build-assets.mjs into
// src/data/manifest.json (design-system.md §8). Kept in lib/ since it has
// no section of its own but every lib/ and sections/ module needs it.

/** One artwork's build-time-extracted data, in allowlist order. */
export interface ArtworkManifestEntry {
  id: string;
  title: string;
  titleJa: string;
  alt: string;
  /** Only present for the two artworks the creative direction calls out. */
  role?: "hero" | "finale";
  /** width / height */
  aspect: number;
  /** Dominant color — drives --live-bg when this artwork is focused. */
  dominant: string;
  /** Vivid (high-saturation, mid-lightness) color — drives --live-accent. */
  vivid: string;
  /** #0A0A12 or #FFF3DC, whichever clears 4.5:1 against `dominant`. */
  text: string;
  /** Present only when neither text candidate reached 4.5:1 (see §1.2). */
  textContrastNote?: string;
  /** ~24px-wide blurred webp placeholder as a data: URI. */
  placeholder: string;
  sources: {
    avif: number[];
    webp: number[];
  };
}

export type Manifest = ArtworkManifestEntry[];
