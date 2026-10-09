// Per overlay: time spent in update(t) while scrubbing the whole film (whose work is it when a tick is slow?).
import { chromium } from "playwright-core";
const [size = "1440x900"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width, height } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
await page.waitForTimeout(3500);
const r = await page.evaluate(async () => {
  const film = window.__kfilm;
  const ids = ["hang", "evidence", "change", "trace"];
  const times = {};
  film.overlays.forEach((o, i) => {
    if (!o) return;
    const u = o.update.bind(o);
    times[ids[i]] = [];
    o.update = (t) => { const s = performance.now(); u(t); times[ids[i]].push([performance.now() - s, film.pos.id]); };
  });
  const parts = { labels: [], obstacles: [], lit: [] };
  const wrap = (name, key) => { const f = film[name].bind(film); film[name] = (...a) => { const s = performance.now(); const r = f(...a); parts[key].push(performance.now() - s); return r; }; };
  wrap("placeLabels", "labels"); wrap("refreshObstacles", "obstacles"); wrap("updateLit", "lit");
  const tr = film.trigger;
  await new Promise((res) => {
    const t0 = performance.now();
    const f = (t) => { const k = Math.min(1, (t - t0) / 24000); window.scrollTo({ top: tr.start + k * (tr.end - tr.start), behavior: "instant" }); if (k < 1) requestAnimationFrame(f); else setTimeout(res, 600); };
    requestAnimationFrame(f);
  });
  const q = (a, x) => (a.length ? +a[Math.min(a.length - 1, Math.floor(x * a.length))].toFixed(2) : null);
  const out = {};
  for (const [id, arr] of Object.entries(times)) {
    const inAct = arr.filter(([, p]) => p === id).map(([ms]) => ms).sort((a, b) => a - b);
    const all = arr.map(([ms]) => ms).sort((a, b) => a - b);
    out[id] = { calls: all.length, median: q(all, 0.5), p95: q(all, 0.95), max: q(all, 1), inActMedian: q(inAct, 0.5), inActP95: q(inAct, 0.95), inActMax: q(inAct, 1) };
  }
  for (const [k, a] of Object.entries(parts)) { a.sort((x, y) => x - y); out[k] = { calls: a.length, median: q(a, 0.5), p95: q(a, 0.95), max: q(a, 1) }; }
  return out;
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
