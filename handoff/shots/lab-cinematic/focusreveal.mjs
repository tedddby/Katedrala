// Mid-film keyboard focus: tabbing into the hero's actions brings the hero back; Escape and the card's buttons.
// usage: node focusreveal.mjs <out.png> [W]x[H] [p]
import { chromium } from "playwright-core";
const [out, size = "1440x900", pArg = "0.3"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width, height } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
await page.evaluate((p) => {
  const track = document.querySelector("[data-film-track]");
  const top = track.getBoundingClientRect().top + window.scrollY;
  const span = Math.max(0, track.offsetHeight - window.innerHeight);
  window.scrollTo({ top: top + p * span, behavior: "instant" });
}, Number(pArg));
await page.waitForTimeout(2500);
await page.locator("[data-film-hero] a").first().focus();
await page.waitForTimeout(500);
await page.screenshot({ path: out });
const state = await page.evaluate(() => {
  const hero = document.querySelector("[data-film-hero]");
  return { off: hero.hasAttribute("data-off"), opacity: getComputedStyle(hero).opacity, focused: document.activeElement.textContent.trim() };
});
console.log(JSON.stringify(state));
await browser.close();
