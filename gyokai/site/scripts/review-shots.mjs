#!/usr/bin/env node
// GYOKAI — Acid Pop Archive
// Review screenshots (coordinator verification). Serves ./dist via
// `vite preview`, drives the built site with puppeteer, and captures the
// key beats to site/review/*.png. Dev tooling only — not part of the
// shipped site. Never touches ../gyokai.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewDir = path.join(siteRoot, "review");
const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startPreview() {
  const proc = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: siteRoot,
    stdio: "ignore",
    detached: false,
  });
  // Wait for the server to accept connections.
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return proc;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  proc.kill();
  throw new Error("vite preview did not come up on :4173");
}

async function newPage(browser, width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") console.log(`  [console.${type}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
  return page;
}

async function waitForLoaderGone(page) {
  await page.waitForFunction(() => !document.getElementById("loader"), { timeout: 8000 });
  await sleep(2000); // hero entrance settles (≤1.2s) + margin
}

async function main() {
  await mkdir(reviewDir, { recursive: true });
  const server = await startPreview();
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
  });

  try {
    // ── Desktop 1440×900 ────────────────────────────────────────────────
    const page = await newPage(browser, 1440, 900);
    await page.goto(BASE, { waitUntil: "networkidle0" });
    await waitForLoaderGone(page);
    await page.screenshot({ path: path.join(reviewDir, "01-hero.png") });
    console.log("shot 01-hero.png");

    // THE CODE
    await page.evaluate(() => {
      document.getElementById("the-code")?.scrollIntoView({ behavior: "auto", block: "start" });
    });
    await sleep(1400); // slap-in entrances
    await page.screenshot({ path: path.join(reviewDir, "02-the-code.png") });
    console.log("shot 02-the-code.png");

    // ONE STREET ROOM — scroll into the pinned run (~room 7 of 19).
    await page.evaluate(() => {
      const street = document.getElementById("the-street");
      const spacer = street?.parentElement?.classList.contains("pin-spacer")
        ? street.parentElement
        : street;
      const track = document.getElementById("street-track");
      if (!spacer || !track) return;
      const top = spacer.getBoundingClientRect().top + window.scrollY;
      const distance = track.scrollWidth - window.innerWidth;
      window.scrollTo(0, top + distance * (6 / 18));
    });
    await sleep(2000); // scrub (1s smoothing) + re-ink (0.6s) settle
    await page.screenshot({ path: path.join(reviewDir, "03-street-room.png") });
    console.log("shot 03-street-room.png");

    // TAKEOVER — open the poster nearest the current room.
    await page.evaluate(() => {
      const posters = [...document.querySelectorAll(".street__poster")];
      const centered = posters.find((p) => {
        const r = p.getBoundingClientRect();
        return r.left < innerWidth / 2 && r.right > innerWidth / 2;
      });
      (centered ?? posters[6] ?? posters[0])?.click();
    });
    await sleep(2600); // wipeIn 0.7 + populate + wipeOut 0.7 + settle
    await page.screenshot({ path: path.join(reviewDir, "04-takeover.png") });
    console.log("shot 04-takeover.png");

    // Close takeover (Esc), go to ENCORE, mash HYPE.
    await page.keyboard.press("Escape");
    await sleep(2000);
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await sleep(1500);
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => document.getElementById("hype-button")?.click());
      await sleep(120);
    }
    await sleep(900); // overload flash + 最高!!! banner up
    await page.screenshot({ path: path.join(reviewDir, "05-encore.png") });
    console.log("shot 05-encore.png");
    await page.close();

    // ── Mobile 390×844 ─────────────────────────────────────────────────
    const mobile = await newPage(browser, 390, 844);
    await mobile.goto(BASE, { waitUntil: "networkidle0" });
    await waitForLoaderGone(mobile);
    await mobile.screenshot({ path: path.join(reviewDir, "06-mobile-hero.png") });
    console.log("shot 06-mobile-hero.png");

    // ── Desktop 1440×900 — a DARK street room (R2/R5 revision wave check:
    // giant numeral / outlined motifs / caution tape read fine on dark too).
    // "TANGERINE SUIT" (index 15 of 19) is one of the three ink-black rooms.
    const darkPage = await newPage(browser, 1440, 900);
    await darkPage.goto(BASE, { waitUntil: "networkidle0" });
    await waitForLoaderGone(darkPage);
    await darkPage.evaluate(() => {
      const street = document.getElementById("the-street");
      const spacer = street?.parentElement?.classList.contains("pin-spacer")
        ? street.parentElement
        : street;
      const track = document.getElementById("street-track");
      if (!spacer || !track) return;
      const top = spacer.getBoundingClientRect().top + window.scrollY;
      const distance = track.scrollWidth - window.innerWidth;
      const total = document.querySelectorAll(".street__room").length;
      const darkIndex = [...document.querySelectorAll(".street__poster")].findIndex((p) =>
        (p.getAttribute("aria-label") ?? "").includes("TANGERINE SUIT"),
      );
      const index = darkIndex >= 0 ? darkIndex : 15;
      window.scrollTo(0, top + distance * (index / (total - 1)));
    });
    await sleep(2000); // scrub + re-ink settle
    await darkPage.screenshot({ path: path.join(reviewDir, "08-street-dark.png") });
    console.log("shot 08-street-dark.png");
    await darkPage.close();

    await mobile.evaluate(() => {
      const rooms = document.querySelectorAll(".street__room");
      rooms[2]?.scrollIntoView({ behavior: "auto", block: "start" });
    });
    await sleep(1500);
    await mobile.screenshot({ path: path.join(reviewDir, "07-mobile-street.png") });
    console.log("shot 07-mobile-street.png");
    await mobile.close();
  } finally {
    await browser.close();
    server.kill();
  }
  console.log("Done — screenshots in site/review/");
}

main().catch((err) => {
  console.error("review-shots FAILED:", err);
  process.exit(1);
});
