// Does the headline survive viewport resizes in the still layout?
import { chromium } from "playwright-core";
const reduced = !process.argv.includes("--film");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForTimeout(3000);
const shots = [];
for (const [w, h] of [[1440, 900], [1440, 1400], [1440, 900], [1200, 800], [1440, 900]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(800);
  const f = `cap/rs-${shots.length}.png`;
  await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 760, height: 620 } });
  shots.push(f);
}
console.log(shots.join(" "));
await browser.close();
