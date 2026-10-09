// Who is requesting animation frames when the film should be idle? Counts rAF calls by caller stack.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__callers = new Map();
  window.__counting = false;
  window.requestAnimationFrame = (cb) => {
    if (window.__counting) {
      const stack = (new Error().stack || "").split("\n").slice(2, 5).map((s) => s.trim().replace(/\(.*\/_next\/static\//, "(").slice(0, 120)).join(" < ");
      window.__callers.set(stack, (window.__callers.get(stack) || 0) + 1);
    }
    return raf(cb);
  };
});
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
await page.waitForTimeout(5000);
const run = async (label) => {
  await page.evaluate(() => { window.__callers.clear(); window.__counting = true; });
  await page.waitForTimeout(1500);
  const out = await page.evaluate(() => { window.__counting = false; return [...window.__callers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6); });
  console.log(label, JSON.stringify(out, null, 1));
};
await run("hero");
await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
await page.waitForTimeout(1500);
await run("past film");
await browser.close();
