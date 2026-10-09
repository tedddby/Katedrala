import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
const BL = "../../lab/promotion/baseline";
mkdirSync("quick", { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
for (const [tag, width, height, phone] of [["1440", 1440, 900, false], ["390", 390, 844, true]]) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 });
  const page = await context.newPage();
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  for (const id of ["history", "developers", "open-source", "ecosystem"]) {
    const loc = page.locator(`main > section#${id}`);
    const aria = await loc.ariaSnapshot();
    const text = await loc.evaluate((el) => el.innerText);
    const same = (a, b) => a.trim() === b.trim();
    const baseAria = readFileSync(`${BL}/${tag}/${id}.aria.yml`, "utf8");
    const baseText = readFileSync(`${BL}/${tag}/${id}.txt`, "utf8");
    writeFileSync(`quick/${tag}-${id}.aria.yml`, aria + "\n");
    writeFileSync(`quick/${tag}-${id}.txt`, text + "\n");
    console.log(`${tag} ${id}: aria ${same(aria, baseAria) ? "identical" : "differs"}, text ${same(text, baseText) ? "identical" : "differs"}`);
  }
  await context.close();
}
await browser.close();
