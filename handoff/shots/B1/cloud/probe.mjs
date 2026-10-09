// Quick probe: does the film take its WebGL path here? Mode, renderer, marks, errors.
// usage: node probe.mjs [W]x[H] [--swiftshader] [--reduced] [--nowebgl] [--url u]
import { chromium } from "playwright-core";
const [size = "1440x900", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const flag = (f) => rest.includes(f);
const opt = (f, d) => (rest.includes(f) ? rest[rest.indexOf(f) + 1] : d);
const url = opt("--url", "http://localhost:3100/lab/cinematic/");
const args = [];
if (flag("--swiftshader")) args.push("--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist");
if (flag("--nowebgl")) args.push("--disable-webgl", "--disable-webgl2", "--disable-3d-apis");
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const mobile = width < 600;
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: flag("--reduced") ? "reduce" : "no-preference" });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`console ${m.type()}: ${m.text().slice(0, 300)}`); });
const reqs = [];
page.on("request", (r) => reqs.push(r.url()));
const t0 = Date.now();
await page.goto(url, { waitUntil: "load" });
const ready = await page.waitForSelector("canvas[data-ready]", { timeout: 45000 }).then(() => Date.now() - t0).catch(() => null);
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
  const caveat = !!document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
  return {
    mode: document.documentElement.dataset.kfilm,
    ready: document.documentElement.dataset.kfilmReady,
    live: document.documentElement.dataset.kfilmLive,
    under: document.documentElement.dataset.kfilmUnder,
    renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl ? "webgl2 (no debug info)" : "none",
    caveatProbe: caveat,
    marks: performance.getEntriesByType("mark").filter((m) => m.name.startsWith("kfilm")).map((m) => `${m.name} ${Math.round(m.startTime)}`),
    stage: !!window.__kfilm?.stage,
    fallbackNote: !document.querySelector("[data-film-fallback]")?.hidden,
  };
});
console.log(JSON.stringify({ size, args, readyMs: ready, ...info }, null, 1));
console.log("three/gsap requests:", reqs.filter((u) => /three|gsap|ScrollTrigger|stage|director|still/i.test(u)).map((u) => u.replace(/^https?:\/\/[^/]+/, "")).join("\n  "));
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
