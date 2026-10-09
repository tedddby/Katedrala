// The acts' main-thread cost per frame in the film: each overlay's update(t) and each act's lit(t), timed in the
// page while the scroll steps through Acts II, III and the landing, one step per animation frame. SwiftShader here:
// the CPU figures stand, the frame times do not. Usage: node r3/perf-overlays.mjs <w>x<h>
import { chromium } from "playwright-core";
const [w, h] = (process.argv[2] ?? "1440x900").split("x").map(Number);
const mobile = w < 600;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(1500);
// Bring every act's overlay into being (mounted lazily when its act first comes near), then instrument.
for (const act of [1, 2, 3]) {
  await page.evaluate((act) => { const f = window.__kfilm; const P = f.clock.progressOf(act, 0.5); window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" }); }, act);
  await page.waitForTimeout(800);
}
const report = await page.evaluate(async () => {
  const f = window.__kfilm;
  const times = { update: {}, lit: {} };
  f.overlays.forEach((o, i) => {
    if (o === null) return;
    const id = f.acts[i].id;
    times.update[id] = [];
    const orig = o.update.bind(o);
    times.top = times.top ?? [];
    o.update = (t) => { const t0 = performance.now(); orig(t); const d = performance.now() - t0; times.update[id].push(d); if (d > 2) times.top.push(`${id} t=${t.toFixed(3)} ${d.toFixed(1)}ms`); };
  });
  f.acts.forEach((a, i) => {
    const id = a.id;
    times.lit[id] = [];
    const orig = a.lit;
    a.lit = (t, m) => { const t0 = performance.now(); const r = orig(t, m); times.lit[id].push(performance.now() - t0); return r; };
  });
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  for (const act of [1, 2, 3]) {
    const steps = act === 3 ? 60 : 180;
    for (let k = 0; k <= steps; k++) {
      const P = f.clock.progressOf(act, k / steps);
      window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" });
      await frame();
    }
  }
  const stat = (xs) => {
    if (!xs || xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return { n: s.length, median: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3), max: +s[s.length - 1].toFixed(3) };
  };
  const out = {};
  for (const kind of ["update", "lit"]) for (const [id, xs] of Object.entries(times[kind])) out[`${kind} ${id}`] = stat(xs);
  out.top = times.top;
  return out;
});
console.log("over 2 ms:", (report.top ?? []).join("; "));
delete report.top;
for (const [k, v] of Object.entries(report)) if (v) console.log(`${w}x${h} ${k}: n ${v.n}, median ${v.median} ms, p95 ${v.p95} ms, max ${v.max} ms`);
await browser.close();
