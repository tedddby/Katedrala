// Explorer check: module view and member view at a given width, with a zoomed member view on phones.
import { chromium } from "playwright-core";
const [url, out] = process.argv.slice(2);
const width = Number(process.env.WIDTH ?? 1440);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width < 600 ? 2 : 1, hasTouch: width < 600, isMobile: width < 600 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
await page.goto(url, { waitUntil: "networkidle" });
await page.addStyleTag({ content: ".site-nav, nextjs-portal { visibility: hidden !important; }" });
const sheet = page.locator("#architecture .explorer-sheet");
await sheet.scrollIntoViewIfNeeded();
await page.waitForTimeout(900);
const mode = await page.locator('#architecture .segmented button[aria-pressed="true"]').textContent();
await page.locator("#architecture").screenshot({ path: `${out}/${width}-explorer-initial.png` });
await page.locator("#architecture .segmented button", { hasText: mode === "Modules" ? "Members" : "Modules" }).click();
await page.waitForTimeout(800);
await sheet.screenshot({ path: `${out}/${width}-explorer-other.png` });
if (width < 600) {
  await page.locator("#architecture button[aria-label=\"Zoom in\"]").click();
  await page.locator("#architecture button[aria-label=\"Zoom in\"]").click();
  await page.locator("#architecture button[aria-label=\"Zoom in\"]").click();
  await page.waitForTimeout(500);
  await sheet.screenshot({ path: `${out}/${width}-explorer-zoomed.png` });
}
const touch = await page.locator("#architecture svg.select-none").getAttribute("class");
console.log(`initial mode: ${mode}; svg classes: ${touch}`);
console.log(errors.length ? errors.join("\n") : "no errors");
await browser.close();
