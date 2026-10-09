import { chromium } from "playwright-core";
const reduced = process.argv.includes("--reduced");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForTimeout(4000);
console.log(await page.locator("section#top").ariaSnapshot());
await browser.close();
