import { defineConfig } from 'vite';

// 真昼の月 — The Midday Moon.
// Relative base so the built site works from a subpath: it is served at
// https://jiaowh.github.io/shiro/site/dist/, not the domain root. With
// base: './', Vite rewrites every /assets/… reference in index.html
// (script, stylesheet, <img> src/srcset) to ./assets/…, so the page loads
// its bundle and all plate/jacket images relative to wherever it is hosted.
export default defineConfig({
  base: './',
});
