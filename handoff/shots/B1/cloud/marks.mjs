// Marks on load, median of N runs, per mode: FCP, kfilm:start, model, stage-ready, first-frame; the WebGL context count.
import { chromium } from "playwright-core";
const [size = "1440x900", mode = "film", runsArg = "5"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const args = mode === "nowebgl" ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const rows = [];
for (let i = 0; i < Number(runsArg); i++) {
  const mobile = width < 600;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: mode === "reduced" ? "reduce" : "no-preference" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__contexts = 0;
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const c = orig.call(this, type, ...rest);
      if (c && (type === "webgl2" || type === "webgl")) window.__contexts++;
      return c;
    };
  });
  await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 45000 });
  await page.waitForTimeout(800);
  rows.push(await page.evaluate(() => {
    const m = (n) => { const e = performance.getEntriesByName(n)[0]; return e ? Math.round(e.startTime) : null; };
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return { fcp: fcp ? Math.round(fcp.startTime) : null, start: m("kfilm:start"), model: m("kfilm:model"), stage: m("kfilm:stage-ready"), first: m("kfilm:first-frame"), contexts: window.__contexts, mode: document.documentElement.dataset.kfilm };
  }));
  await context.close();
}
const med = (k) => { const v = rows.map((r) => r[k]).filter((x) => x !== null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
console.log(JSON.stringify({ size, mode, runs: rows.length, fcp: med("fcp"), start: med("start"), model: med("model"), stage: med("stage"), first: med("first"), contexts: rows.map((r) => r.contexts).join(","), modes: [...new Set(rows.map((r) => r.mode))] }));
await browser.close();
