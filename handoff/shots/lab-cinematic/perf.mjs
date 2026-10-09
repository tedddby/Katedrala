// Frame-time measurement on the cinematic route: requestAnimationFrame intervals and the stage's own CPU time
// per frame, during the hang (scrolling through the drop and the breathing) and during the flip.
// usage: node perf.mjs [W]x[H] [--swiftshader] [--dpr n]
import { chromium } from "playwright-core";
const [size = "1440x900", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const dpr = rest.includes("--dpr") ? Number(rest[rest.indexOf("--dpr") + 1]) : 1;
const args = rest.includes("--swiftshader") ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
const gpu = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
});
await page.waitForTimeout(3000);
const result = await page.evaluate(async () => {
  const film = window.__kfilm;
  const stage = film.stage;
  const cpu = [];
  const orig = stage.frame.bind(stage);
  stage.frame = (p, dt) => { const t = performance.now(); const r = orig(p, dt); cpu.push(performance.now() - t); return r; };
  const track = document.querySelector("[data-film-track]");
  const top = track.getBoundingClientRect().top + scrollY;
  const span = track.offsetHeight - innerHeight;
  const sample = (ms) => new Promise((res) => {
    const times = [];
    const start = performance.now();
    const f = (t) => { times.push(t); if (t - start < ms) requestAnimationFrame(f); else res(times); };
    requestAnimationFrame(f);
  });
  const scrollTo = (p0, p1, ms) => new Promise((res) => {
    const start = performance.now();
    const f = (t) => {
      const k = Math.min(1, (t - start) / ms);
      window.scrollTo({ top: top + (p0 + (p1 - p0) * k) * span, behavior: "instant" });
      if (k < 1) requestAnimationFrame(f); else res();
    };
    requestAnimationFrame(f);
  });
  const stats = (times, cpuSlice) => {
    const d = [];
    for (let i = 1; i < times.length; i++) d.push(times[i] - times[i - 1]);
    d.sort((a, b) => a - b);
    const c = [...cpuSlice].sort((a, b) => a - b);
    const q = (arr, x) => arr.length ? +arr[Math.min(arr.length - 1, Math.floor(x * arr.length))].toFixed(2) : null;
    return { frames: d.length, median: q(d, 0.5), p95: q(d, 0.95), max: q(d, 1), over20: d.filter((x) => x > 20).length, cpuMedian: q(c, 0.5), cpuP95: q(c, 0.95) };
  };
  window.scrollTo({ top: top, behavior: "instant" });
  await sample(1500);
  // The hang: scroll through the drop and into the breathing model, then hold while it sways.
  let c0 = cpu.length;
  const s1 = sample(9000);
  await scrollTo(0.0, 0.4, 6000);
  const hang = stats(await s1, cpu.slice(c0));
  // The flip: from the circle's end through the turn and the load wave.
  window.scrollTo({ top: top + 0.54 * span, behavior: "instant" });
  await sample(1500);
  c0 = cpu.length;
  const s2 = sample(5000);
  await scrollTo(0.54, 0.75, 4500);
  const flip = stats(await s2, cpu.slice(c0));
  return { hang, flip, dpr: devicePixelRatio, stageDpr: stage.dpr };
});
console.log(JSON.stringify({ gpu, size, ...result }, null, 1));
await browser.close();
