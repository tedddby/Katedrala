// Time to first visible structure: navigates, samples screenshots of the drawing area on a clock, and reports
// when drawn ink first appears there, with the page's own marks (first paint, the stage's first frame).
// usage: node ttfs.mjs [W]x[H] [runs] [--reduced] [--nowebgl]
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
const [size = "1440x900", runsArg = "3", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const runs = Number(runsArg);
const args = rest.includes("--nowebgl") ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : [];
const results = [];
for (let r = 0; r < runs; r++) {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args });
  const mobile = width < 600;
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: rest.includes("--reduced") ? "reduce" : "no-preference",
  });
  await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "commit" });
  // The drawing area: right of the hero copy on wide screens, below it on phones; clear of the title block.
  const clip = mobile
    ? { x: 0, y: Math.round(height * 0.45), width, height: Math.round(height * 0.4) }
    : { x: Math.round(width * 0.47), y: 80, width: Math.round(width * 0.5), height: Math.round(height * 0.75) };
  let visibleAt = null;
  let lineAt = null;
  let navStart = null;
  for (let i = 0; i < 80 && visibleAt === null; i++) {
    const buf = await page.screenshot({ clip }).catch(() => null);
    if (buf === null) continue;
    const t = await page.evaluate(() => performance.now()).catch(() => null);
    const png = PNG.sync.read(buf);
    let ink = 0;
    for (let p = 0; p < png.data.length; p += 4) {
      const l = 0.2126 * png.data[p] + 0.7152 * png.data[p + 1] + 0.0722 * png.data[p + 2];
      if (l > 70) ink++;
    }
    const frac = ink / (png.width * png.height);
    if (frac > 0.00005 && t !== null && lineAt === null) lineAt = Math.round(t);
    if (frac > 0.002 && t !== null) visibleAt = Math.round(t);
  }
  const marks = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const frame = performance.getEntriesByName("kfilm:first-frame")[0];
    const mStart = performance.getEntriesByName("kfilm:start")[0];
    const mModel = performance.getEntriesByName("kfilm:model")[0];
    return {
      fcp: fcp ? Math.round(fcp.startTime) : null,
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      firstStageFrame: frame ? Math.round(frame.startTime) : null,
      filmStart: mStart ? Math.round(mStart.startTime) : null,
      modelBuilt: mModel ? Math.round(mModel.startTime) : null,
      mode: document.documentElement.dataset.kfilm,
    };
  });
  const res = await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => /chunk|codeverse|.js/.test(e.name)).map((e) => [e.name.split("/").pop().slice(0, 40), Math.round(e.startTime), Math.round(e.responseEnd), e.transferSize]));
  results.push({ ...marks, firstLine: lineAt, planWithFoundations: visibleAt, res });
  await browser.close();
}
console.log(JSON.stringify(results));
const med = (k) => {
  const v = results.map((x) => x[k]).filter((x) => x !== null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
console.log("median", JSON.stringify({ fcp: med("fcp"), domContentLoaded: med("domContentLoaded"), filmStart: med("filmStart"), modelBuilt: med("modelBuilt"), firstStageFrame: med("firstStageFrame"), firstLine: med("firstLine"), planWithFoundations: med("planWithFoundations") }));

