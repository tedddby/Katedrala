import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
console.log(await page.evaluate(() => ({
  coarse: matchMedia("(pointer: coarse)").matches,
  touchHint: getComputedStyle(document.querySelector(".hint-touch")).display,
  mouseHint: getComputedStyle(document.querySelector(".hint-mouse")).display,
})));
await browser.close();
