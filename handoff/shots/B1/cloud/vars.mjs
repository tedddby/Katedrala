import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
const v = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  return ["--ease-spring", "--z-film-words", "--z-nav", "--page-max", "--page-gutter", "--text-gauge", "--color-ink-faint"].map((n) => `${n}: ${cs.getPropertyValue(n).trim().slice(0, 60)}`);
});
console.log(v.join("\n"));
await browser.close();
