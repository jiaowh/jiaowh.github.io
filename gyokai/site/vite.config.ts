import { defineConfig } from "vite";

// GYOKAI — Acid Pop Archive
// Vanilla TS + Vite. No framework, no CDN dependencies — everything (fonts,
// art, scripts) is bundled/self-hosted. See design-system.md §10 for layout.
export default defineConfig({
  root: ".",
  // Relative base so the built site works from any subpath (it is served at
  // https://jiaowh.github.io/gyokai/site/dist/, not the domain root).
  base: "./",
  publicDir: "public",
  build: {
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
