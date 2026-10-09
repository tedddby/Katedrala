// The hero after a focus reveal: its opacity frame by frame from the Tab that lands on it (instant, no fade), and
// the film's root marked [data-instant] only for the frame that shows it.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const f = window.__kfilm; const tr = f.trigger;
  window.scrollTo({ top: tr.start + f.clock.progressOf(0, 0.6) * (tr.end - tr.start), behavior: "instant" });
});
await page.waitForTimeout(1500);
// Focus the link before the hero, then Tab onto the hero's first action.
await page.evaluate(() => {
  const links = [...document.querySelectorAll(".site-nav a")].filter((a) => a.getClientRects().length > 0 && a.textContent.includes("Get started"));
  links[0].focus({ preventScroll: true });
  window.__frames = [];
  const hero = document.querySelector("[data-film-hero]");
  const rec = () => {
    window.__frames.push([Math.round(performance.now()), getComputedStyle(hero).opacity, hero.hasAttribute("data-off") ? "off" : "on", document.querySelector("[data-instant]") ? "instant" : "-", Math.round(scrollY)]);
    if (window.__frames.length < 30) requestAnimationFrame(rec);
  };
  requestAnimationFrame(rec);
});
await page.keyboard.press("Tab");
await page.waitForTimeout(1200);
const frames = await page.evaluate(() => window.__frames);
console.log(await page.evaluate(() => document.activeElement.textContent));
console.log(frames.map((f) => f.join(" ")).join("\n"));
await browser.close();
