// Telegram alert for the btc.html "Average" tab: runs on GitHub Actions a few minutes after every 4h close and
// sends a message only when the traded position (the card's "last rebalance target") changes.
// The strategy code is NOT copied: the functions/constants below are extracted from btc.html at run time,
// so the alert always runs exactly what the page shows.
// env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, AVG_MODE (spot | vt60 | vt80, default spot = full size), STATE_FILE,
//      DRY_RUN=1 (print instead of sending), FORCE_CANDLES / FORCE_FUNDING (test a fallback source)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MODE = process.env.AVG_MODE || "spot";
const STATE_FILE = process.env.STATE_FILE || resolve(ROOT, ".alert-state/avg.json");
const DRY = process.env.DRY_RUN === "1";
const H4 = 14400, DAYS = 86400;

// ---------- 1. pull the strategy out of btc.html ----------
const NAMES = ["DAY", "iEMA", "iSMMA", "iZLEMA", "iSMAv", "impulseMACD", "smaN", "ENS_TF", "ENS_STEPS", "ENS_STEP_UP_MARGIN", "ensLevels", "ENS_STEP_TXT",
  "ENS_FUND_THR", "ENS_FUND_STALE", "ensFunding14", "ENS_SMA", "ENS_FAM", "ENS_SIZING", "ensGroup", "ensSpread", "computeEnsemble"];
function statementAt(src, start, isFn) {
  // scan one top-level declaration: skips strings, template literals (with ${} nesting) and comments
  let depth = 0, i = start, seenBody = false; const tpl = [];
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (tpl.length && tpl[tpl.length - 1] === "t") {            // inside a template literal
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { tpl.pop(); i++; continue; }
      if (c === "$" && d === "{") { tpl.push(depth); depth++; i += 2; continue; }
      i++; continue;
    }
    if (c === "/" && d === "/") { i = src.indexOf("\n", i); continue; }
    if (c === "/" && d === "*") { i = src.indexOf("*/", i) + 2; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (src[j] !== c) j += src[j] === "\\" ? 2 : 1; i = j + 1; continue; }
    if (c === "`") { tpl.push("t"); i++; continue; }
    if (c === "(" || c === "[" || c === "{") { if (c === "{" && depth === 0) seenBody = true; depth++; i++; continue; }
    if (c === ")" || c === "]" || c === "}") {
      depth--; i++;
      if (c === "}" && tpl.length && tpl[tpl.length - 1] === depth) { tpl.pop(); continue; }   // back into the enclosing template
      if (isFn && seenBody && depth === 0) return src.slice(start, i);
      continue;
    }
    if (!isFn && c === ";" && depth === 0) return src.slice(start, i + 1);
    i++;
  }
  throw new Error("unterminated declaration at " + start);
}
function loadStrategy() {
  const src = readFileSync(resolve(ROOT, "btc.html"), "utf8").replace(/\r\n/g, "\n");
  const parts = [];
  for (const n of NAMES) {
    const m = new RegExp(`^(?:async )?function ${n}\\(|^const ${n}=`, "m").exec(src);
    if (!m) throw new Error(`btc.html: ${n} not found`);
    parts.push(statementAt(src, m.index, m[0].includes("function")));
  }
  const api = "computeEnsemble, ENS_SIZING, ENS_STEP_TXT, ENS_FUND_THR, ENS_FUND_STALE, ENS_IN, ENS_OUT, ENS_BAND";
  return new Function(parts.join("\n") + `\nreturn {${api}};`)();
}

// ---------- 2. data (US-hosted runner: Binance/Bybit may refuse, so each has fallbacks) ----------
async function getJSON(url, opt) {
  const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}
async function klinesBinance(base, n) {                      // api.binance.com or the data-api.binance.vision mirror
  let out = [], end = Date.now();
  while (out.length < n) {
    const j = await getJSON(`${base}/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=1000&endTime=${end}`);
    if (!j.length) break;
    out = j.map(k => ({ time: k[0] / 1000, open: +k[1], high: +k[2], low: +k[3], close: +k[4] })).concat(out);
    end = j[0][0] - 1; if (j.length < 1000) break;
  }
  return out.slice(-n);
}
async function klinesCoinbase(n) {                           // 1h -> 4h (Coinbase has no 4h granularity)
  const m = new Map(); let end = Math.floor(Date.now() / 1000 / 3600) * 3600 + 3600;
  for (let k = 0; k < 90 && m.size < n * 4 + 8; k++) {
    const st = end - 300 * 3600;
    const j = await getJSON(`https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600&start=${new Date(st * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`,
      { headers: { "User-Agent": "avg-alert" } });
    if (!j.length) break;
    for (const [t, lo, hi, op, cl] of j) m.set(t, { t, op, hi, lo, cl });
    end = st;
  }
  const hs = [...m.values()].sort((a, b) => a.t - b.t), o = []; let cur = null;
  for (const h of hs) {
    const b = Math.floor(h.t / H4) * H4;
    if (!cur || cur.time !== b) { if (cur) o.push(cur); cur = { time: b, open: h.op, high: h.hi, low: h.lo, close: h.cl, n: 0 }; }
    else { cur.high = Math.max(cur.high, h.hi); cur.low = Math.min(cur.low, h.lo); cur.close = h.cl; }
    cur.n++;
  }
  if (cur) o.push(cur);
  return o.filter((c, i) => c.n === 4 || i === o.length - 1).slice(-n);
}
async function getCandles(n = 6000) {
  const srcs = [["Binance", () => klinesBinance("https://api.binance.com", n)],
    ["Binance data mirror", () => klinesBinance("https://data-api.binance.vision", n)],
    ["Coinbase 1h→4h", () => klinesCoinbase(n)]];
  const errs = [];
  for (const [name, f] of srcs) {
    if (process.env.FORCE_CANDLES && !name.toLowerCase().includes(process.env.FORCE_CANDLES)) continue;
    try { const d = await f(); if (d.length > 1200) return { data: d, src: name }; errs.push(`${name}: only ${d.length} bars`); }
    catch (e) { errs.push(`${name}: ${e.message}`); }
  }
  throw new Error("candles unavailable — " + errs.join("; "));
}
// funding stamps as the page uses them: 8h stamps [tSec, rate], ascending
async function fundBinance(from) {
  const m = new Map(); let s = from * 1000;
  for (let k = 0; k < 15; k++) {
    const j = await getJSON(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&startTime=${s}&limit=1000`);
    for (const x of j) m.set(Math.floor(x.fundingTime / 1000), +x.fundingRate);
    if (j.length < 1000) break; s = j[j.length - 1].fundingTime + 1;
  }
  return m;
}
async function fundBybit(from) {
  const m = new Map(); let end = Date.now();
  for (let k = 0; k < 40; k++) {
    const l = ((await getJSON(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=200&endTime=${end}`)).result || {}).list || [];
    if (!l.length) break;
    let old = Infinity; for (const x of l) { const t = +x.fundingRateTimestamp; m.set(Math.floor(t / 1000), +x.fundingRate); old = Math.min(old, t); }
    if (old / 1000 <= from) break; end = old - 1;
  }
  return m;
}
async function fundOKX(from) {                               // 8h stamps like Binance, but only ~3 months of history
  const m = new Map(); let after = "";
  for (let k = 0; k < 40; k++) {
    const j = (await getJSON(`https://www.okx.com/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=100${after}`)).data || [];
    if (!j.length) break;
    let old = Infinity; for (const x of j) { const t = +x.fundingTime; m.set(Math.floor(t / 1000), +(x.realizedRate || x.fundingRate)); old = Math.min(old, t); }
    if (old / 1000 <= from) break; after = `&after=${old}`;
  }
  return m;
}
// NOT used: Hyperliquid funding reads 5-7 pts/yr above Binance (checked 2023-06..2026-09: 269 extra "crowded"
// days vs 0 missed), so it would trim far too often. Bybit tracks Binance (corr .94, flags agree 97.5%).
async function getFunding(from) {
  const srcs = [["Binance", fundBinance], ["Bybit", fundBybit], ["OKX", fundOKX]], errs = [];
  for (const [name, f] of srcs) {
    if (process.env.FORCE_FUNDING && !name.toLowerCase().includes(process.env.FORCE_FUNDING)) continue;
    try { const m = await f(from); if (m.size > 30) return { src: name, stamps: [...m.entries()].sort((a, b) => a[0] - b[0]) }; errs.push(`${name}: ${m.size} stamps`); }
    catch (e) { errs.push(`${name}: ${e.message}`); }
  }
  return { error: errs.join("; ") || "no funding source tried" };
}

// ---------- 3. telegram + state ----------
async function send(text) {
  if (DRY || !process.env.TELEGRAM_BOT_TOKEN) { console.log("---- message ----\n" + text + "\n-----------------"); return; }
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }) });
  if (!r.ok) throw new Error("telegram " + r.status + " " + (await r.text()));
}
const loadState = () => { try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return {}; } };
const saveState = s => { mkdirSync(dirname(STATE_FILE), { recursive: true }); writeFileSync(STATE_FILE, JSON.stringify(s, null, 1)); };
const utc = t => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const fx = x => x.toFixed(2) + "×";

// ---------- 4. run ----------
async function main() {
  const S = loadState(), now = Date.now() / 1000;
  const L = loadStrategy();
  if (!L.ENS_SIZING[MODE]) throw new Error(`AVG_MODE ${MODE} not in btc.html ENS_SIZING`);
  const [{ data, src }, got] = await Promise.all([getCandles(), getFunding(Math.floor(now) - 1020 * DAYS)]);
  // merge into the cached stamp history exactly like the page's refresh: a new source only fills in newer stamps.
  // If every source fails, the cache is used as is and the page's freshness rule freezes the last valid reading.
  const cache = S.fund && S.fund.stamps && S.fund.stamps.length ? S.fund : null;
  let fund = got;
  if (!got.error && cache) {
    const same = cache.src === got.src, m = new Map(cache.stamps);
    for (const [t, r] of got.stamps) if (same || !m.has(t)) m.set(t, r);
    const lo = now - 1100 * DAYS;
    fund = { src: same || cache.src.includes(got.src) ? cache.src : cache.src + "+" + got.src,
      stamps: [...m.entries()].filter(x => x[0] >= lo).sort((a, b) => a[0] - b[0]) };
  } else if (got.error && cache) fund = { ...cache, cachedOnly: got.error };
  const R = L.computeEnsemble(data, fund.error ? null : fund);
  if (!R || isNaN(R.E[R.t.length - 1])) throw new Error(`not enough history from ${src} (${data.length} bars)`);
  const n = R.t.length - 1, barClose = R.t[n] + H4, price = data.find(c => c.time === R.t[n]).close;
  const tgt = R.banded[MODE][n], lv = R.lvl[n], inn = R.inn[n], f = R.f14[n];
  const lastStamp = fund.error ? NaN : fund.stamps[fund.stamps.length - 1][0];
  const fundStale = fund.error ? true : now - lastStamp > L.ENS_FUND_STALE;
  const state = inn === 1 ? `IN · ${L.ENS_STEP_TXT(lv)}${R.trim[n] < 1 ? " · crowded ⅔" : ""}` : "OUT";
  const detail = `vote ${(R.E[n] * 100).toFixed(0)}% long · ${state} · desired ${fx(R.pos[MODE][n])}\n` +
    `funding 14d ${isNaN(f) ? "—" : (f * 100).toFixed(1) + "%/yr"} (${fund.error ? "unavailable — positions untrimmed" : fund.src}${fundStale && !fund.error ? `, STALE since ${utc(lastStamp)} — last valid reading frozen` : ""})\n` +
    `BTC ${price.toLocaleString("en-US", { maximumFractionDigits: 0 })} · bar closed ${utc(barClose)} · candles ${src}`;
  const label = L.ENS_SIZING[MODE].label;
  console.log(`[${utc(now)}] ${MODE} target ${fx(tgt)} | ${detail.replace(/\n/g, " | ")}`);

  const prev = S.target, week = Math.floor(now / (7 * DAYS));
  if (prev === undefined) {
    await send(`🤖 <b>BTC Average alert is live</b> (${label})\nCurrent target: <b>${fx(tgt)}</b>\n${detail}\nYou'll get a message only when the target changes.`);
  } else if (Math.abs(tgt - prev) > 1e-9) {
    const up = tgt > prev, verb = tgt === 0 ? "SELL ALL — exit to cash" : prev === 0 ? "BUY — enter" : up ? "BUY — increase" : "SELL — reduce";
    await send(`${up ? "🟢" : "🔴"} <b>${verb}</b>\n${label}: <b>${fx(prev)} → ${fx(tgt)}</b> of capital in BTC\n` +
      `(trade to the current target at the next chance; if you miss it, trade late to whatever the target is then)\n${detail}`);
  } else if (S.week !== undefined && week !== S.week) {
    await send(`✅ weekly check — no change. ${label} target <b>${fx(tgt)}</b>\n${detail}`);
  }
  if (got.error && S.fundErrDay !== Math.floor(now / DAYS)) {
    await send(fund.error ? `⚠️ funding data unavailable (${got.error}) and nothing cached. Positions are UNTRIMMED until it returns.`
      : `⚠️ funding sources failing (${got.error}); using the cached history (${fund.src}) — the page rule freezes the last valid reading.`);
    S.fundErrDay = Math.floor(now / DAYS);
  }
  const { cachedOnly, ...keep } = fund;
  saveState({ ...S, target: tgt, bar: R.t[n], week, lastRun: utc(now), mode: MODE, candles: src,
    funding: got.error ? "cache" : got.src, fund: fund.error ? S.fund : keep });
}

main().catch(async e => {
  console.error(e);
  const S = loadState(), day = Math.floor(Date.now() / 1000 / DAYS);
  if (S.errDay !== day) {                                   // at most one error message a day
    try { await send(`⚠️ BTC Average alert failed: ${String(e.message || e).slice(0, 400)}\nIt will retry at the next 4h close.`); } catch (e2) { console.error(e2); }
    saveState({ ...S, errDay: day });
  }
});
