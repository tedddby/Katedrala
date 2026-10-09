// Without JavaScript: every act's words present (h2s, the record), no canvas shown, no empty figure.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, javaScriptEnabled: false });
  await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
  console.log(`${w}x${h}`, JSON.stringify(await page.evaluate(() => ({
    kfilm: document.documentElement.dataset.kfilm ?? null,
    h1: document.querySelector("h1")?.textContent,
    h2: [...document.querySelectorAll("[data-film-track] h2")].map((x) => x.textContent),
    record: !!document.querySelector("[data-film-track] pre")?.textContent.includes("edge:68b8718fedaa1a19"),
    canvasesShown: [...document.querySelectorAll("canvas")].filter((c) => getComputedStyle(c).display !== "none" && c.getBoundingClientRect().width > 0).length,
    figuresShown: [...document.querySelectorAll("[data-still-act]")].filter((f) => getComputedStyle(f).display !== "none").length,
    textLength: document.querySelector("[data-film-track]").innerText.length,
  }))));
  await page.close();
}
await browser.close();
