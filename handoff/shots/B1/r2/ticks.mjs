// The film's own work per frame while scrubbing the whole film (every act): Director.tick timed (stage, choreography,
// overlays, labels), per act, median and p95; frame intervals (software rendering: not real figures); long tasks.
// usage: node ticks.mjs [W]x[H] [seconds]
import { chromium } from "playwright-core";
const [size = "1440x900", secondsArg = "24"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const mobile = width < 600;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
await page.waitForTimeout(3500);
const r = await page.evaluate(async (seconds) => {
  const film = window.__kfilm;
  const cpu = [];
  const tick = film.tick;
  film.tick = (now) => { const t = performance.now(); tick(now); cpu.push([performance.now() - t, film.pos.id]); };
  const longTasks = [];
  const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) longTasks.push(Math.round(e.duration)); });
  try { po.observe({ type: "longtask" }); } catch {}
  const tr = film.trigger;
  await new Promise((res) => {
    const t0 = performance.now();
    const f = (t) => { const k = Math.min(1, (t - t0) / (seconds * 1000)); window.scrollTo({ top: tr.start + k * (tr.end - tr.start), behavior: "instant" }); if (k < 1) requestAnimationFrame(f); else setTimeout(res, 600); };
    requestAnimationFrame(f);
  });
  film.tick = tick;
  po.disconnect();
  const q = (a, x) => (a.length ? +a[Math.min(a.length - 1, Math.floor(x * a.length))].toFixed(2) : null);
  const by = {};
  for (const [ms, id] of cpu) (by[id] ??= []).push(ms);
  const out = {};
  for (const [id, a] of Object.entries(by)) { a.sort((x, y) => x - y); out[id] = { ticks: a.length, median: q(a, 0.5), p95: q(a, 0.95), max: q(a, 1) }; }
  const all = cpu.map((c) => c[0]).sort((x, y) => x - y);
  return { all: { ticks: all.length, median: q(all, 0.5), p95: q(all, 0.95) }, byAct: out, longTasks: longTasks.length, longTaskMax: longTasks.length ? Math.max(...longTasks) : 0 };
}, Number(secondsArg));
console.log(JSON.stringify({ size, ...r }));
await browser.close();
