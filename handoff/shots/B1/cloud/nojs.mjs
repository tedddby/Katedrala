// Without JavaScript: the still layout (CSS default), every word present, no empty canvas shown.
import { chromium } from "playwright-core";
const [size = "1440x900"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width, height }, javaScriptEnabled: false });
const page = await context.newPage();
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForTimeout(1000);
const info = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll("canvas")].map((c) => getComputedStyle(c).display);
  const text = document.querySelector("section#top").innerText;
  return { kfilm: document.documentElement.dataset.kfilm ?? null, js: document.documentElement.dataset.js ?? null, canvases, h1: document.querySelector("h1").innerText, hasNarration: text.includes("Gravity finds the form."), hasCrown: text.includes("The crown of CodeVerse"), hasDescription: text.includes("31 files depend on other files"), height: document.documentElement.scrollHeight };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: `cap/nojs-${size}.png` });
await browser.close();
