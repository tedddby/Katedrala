// First frame on load, median of n: kfilm marks and first contentful paint, film / reduced motion / WebGL disabled.
// usage: node marks.mjs <W>x<H> <film|reduced|nowebgl> [n]
import { chromium } from "playwright-core";
const [size = "1440x900", kind = "film", nArg = "5"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const mobile = width < 600;
const args = kind === "nowebgl" ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : [];
const runs = [];
for (let i = 0; i < Number(nArg); i++) {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: kind === "reduced" ? "reduce" : "no-preference" });
  await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
  await page.waitForFunction(() => performance.getEntriesByName("kfilm:first-frame").length > 0, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(500);
  runs.push(await page.evaluate(() => {
    const m = (n) => { const e = performance.getEntriesByName(n)[0]; return e ? Math.round(e.startTime) : null; };
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return { fcp: fcp ? Math.round(fcp.startTime) : null, start: m("kfilm:start"), stage: m("kfilm:stage-ready"), first: m("kfilm:first-frame"), mode: document.documentElement.dataset.kfilm };
  }));
  await browser.close();
}
const med = (k) => { const v = runs.map((r) => r[k]).filter((x) => x !== null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
console.log(JSON.stringify({ size, kind, n: runs.length, mode: runs[0]?.mode, fcp: med("fcp"), start: med("start"), stageReady: med("stage"), firstFrame: med("first"), firstAfterFcp: med("first") - med("fcp"), runs: runs.map((r) => r.first) }));
