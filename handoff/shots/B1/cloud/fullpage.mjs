import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForTimeout(3000);
await page.screenshot({ path: "cap/fp-a.png", fullPage: true });
const st = await page.evaluate(() => {
  const w = document.querySelector("h1 span[aria-hidden] span");
  const cs = getComputedStyle(w);
  return { opacity: cs.opacity, anim: cs.animationName, h: innerHeight, rect: JSON.stringify(w.getBoundingClientRect()) };
});
console.log(JSON.stringify(st));
await page.screenshot({ path: "cap/fp-b.png", fullPage: true });
await browser.close();
