import { defineConfig } from "vite";

// GYOKAI — Acid Pop Archive
// Vanilla TS + Vite. No framework, no CDN dependencies — everything (fonts,
// art, scripts) is bundled/self-hosted. See design-system.md §10 for layout.
export default defineConfig({
  root: ".",
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
