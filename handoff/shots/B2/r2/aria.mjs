// The film's accessibility tree (Playwright ariaSnapshot of the film section) in film and still modes.
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const [mode, w, h] of [["film", 1440, 900], ["still", 1440, 900], ["film", 390, 844]]) {
  const mobile = w < 600;
  const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, reducedMotion: mode === "still" ? "reduce" : "no-preference" });
  await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const snap = await page.locator("section#top").ariaSnapshot();
  writeFileSync(`r2/aria-${mode}-${w}.txt`, snap);
  const lines = snap.split("\n");
  console.log(`${mode} ${w}: ${lines.length} lines; headings:`, lines.filter((l) => /heading/.test(l)).map((l) => l.trim()).join(" | "));
  await page.close();
}
await browser.close();
