// The still layout (reduced motion, WebGL disabled, or no JavaScript), captured by scrolling the window through the
// film section, one viewport at a time (no beyond-viewport capture: it would re-lay the page out).
// usage: node stillshots.mjs <W>x<H> <reduced|nowebgl|nojs> [out-prefix]
import { chromium } from "playwright-core";
const [size, kind, prefix = `cap/still-${kind}`] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const args = kind === "nowebgl" ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const mobile = width < 600;
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, reducedMotion: kind === "reduced" ? "reduce" : "no-preference", javaScriptEnabled: kind !== "nojs" });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForTimeout(kind === "nojs" ? 800 : 3000);
const end = await page.evaluate(() => {
  const s = document.querySelector("section[aria-labelledby='film-title']");
  return Math.round(s.getBoundingClientRect().bottom + scrollY);
});
const files = [];
for (let y = 0, i = 0; y < end + height * 0.5 && i < 14; y += Math.round(height * 0.9), i++) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
  await page.waitForTimeout(kind === "nojs" ? 200 : 900);
  const f = `${prefix}-${size}-${String(i).padStart(2, "0")}.png`;
  await page.screenshot({ path: f });
  files.push(f);
}
const info = await page.evaluate(() => ({
  kfilm: document.documentElement.dataset.kfilm ?? null,
  canvases: [...document.querySelectorAll("canvas")].map((c) => ({ shown: getComputedStyle(c).display !== "none", w: c.width, h: c.height, ready: c.hasAttribute("data-ready") })),
  note: document.querySelector("[data-film-fallback]")?.hidden === false,
}));
console.log(JSON.stringify({ size, kind, end, info, files }));
await browser.close();
