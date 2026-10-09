// WebGL contexts: every getContext("webgl2"/"webgl") call, its cost on the main thread, whether it made a new
// context, and which are alive at the end. usage: node ctx.mjs [W]x[H] [--swiftshader]
import { chromium } from "playwright-core";
const [size = "1440x900", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const args = rest.includes("--swiftshader") ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const page = await browser.newPage({ viewport: { width, height } });
await page.addInitScript(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  window.__ctx = [];
  const seen = new WeakSet();
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const t0 = performance.now();
    const ctx = orig.call(this, type, attrs);
    const dt = performance.now() - t0;
    if (/webgl/.test(type)) {
      const fresh = ctx !== null && !seen.has(ctx);
      if (ctx) seen.add(ctx);
      window.__ctx.push({ type, at: Math.round(t0), ms: +dt.toFixed(1), fresh, ok: ctx !== null, attrs: JSON.stringify(attrs ?? {}), canvas: this.hasAttribute("data-film-canvas") ? "film" : this.isConnected ? "page" : "detached", ref: ctx });
    }
    return ctx;
  };
});
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForSelector("canvas[data-ready]", { timeout: 60000 });
await page.waitForTimeout(2000);
const out = await page.evaluate(() => window.__ctx.map(({ ref, ...c }) => ({ ...c, lost: ref ? ref.isContextLost() : null })));
console.log(JSON.stringify(out, null, 1));
const marks = await page.evaluate(() => performance.getEntriesByType("mark").filter((m) => m.name.startsWith("kfilm")).map((m) => `${m.name} ${Math.round(m.startTime)}`));
console.log(marks.join("\n"));
await browser.close();
