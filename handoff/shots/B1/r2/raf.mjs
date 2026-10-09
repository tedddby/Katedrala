// rAF accounting: every requestAnimationFrame callback counted (with the caller's first stack frame), at the top of
// the film idle, at the landing idle, and with the film off screen. usage: node raf.mjs [W]x[H] [--url u]
import { chromium } from "playwright-core";
const [size = "1440x900", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const url = rest.includes("--url") ? rest[rest.indexOf("--url") + 1] : "http://localhost:3100/lab/cinematic/";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const mobile = width < 600;
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
await page.addInitScript(() => {
  const orig = window.requestAnimationFrame.bind(window);
  window.__raf = { n: 0, by: {} };
  window.requestAnimationFrame = (cb) => {
    const stack = (new Error().stack || "").split("\n").slice(2, 4).map((s) => s.trim().replace(/\(?https?:\/\/[^)]*\/([^/)]+)\)?/, "$1")).join(" < ");
    return orig((t) => {
      window.__raf.n++;
      window.__raf.by[stack] = (window.__raf.by[stack] || 0) + 1;
      cb(t);
    });
  };
});
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
const count = async (label, ms = 2000) => {
  await page.evaluate(() => { window.__raf.n = 0; window.__raf.by = {}; window.__frames0 = window.__kfilm?.frameCount ?? 0; });
  await page.waitForTimeout(ms);
  const r = await page.evaluate(() => ({ n: window.__raf.n, by: window.__raf.by }));
  console.log(label, JSON.stringify(r));
};
await page.waitForTimeout(16000); // the opening, then calm
await count("top idle 2s");
// landing: the end of the track
await page.evaluate(() => { const tr = window.__kfilm.trigger; window.scrollTo({ top: tr.end - 2, behavior: "instant" }); });
await page.waitForTimeout(3000);
await count("landing idle 2s");
await page.evaluate(() => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }); });
await page.waitForTimeout(4000);
await count("offscreen 2s");
await page.waitForTimeout(3000);
await count("offscreen later 2s");
await browser.close();
