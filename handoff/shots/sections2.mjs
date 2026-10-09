// Screenshots sections by id at a given width (WIDTH env, default 1440), with interactions for new sections.
import { chromium } from "playwright-core";
const [url, out, ...ids] = process.argv.slice(2);
const width = Number(process.env.WIDTH ?? 1440);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: width < 600 ? 2 : 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url, { waitUntil: "networkidle" });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
for (const id of ids) {
  const section = page.locator(`#${id}`);
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await section.screenshot({ path: `${out}/${width}-${id}.png` });
  if (id === "developers") {
    for (const name of ["health", "impact", "diff"]) {
      await page.locator(`#developers [role="tab"]:has-text("${name}")`).click();
      await page.waitForTimeout(700);
      await section.locator('[role="tabpanel"]').screenshot({ path: `${out}/${width}-${id}-${name}.png` });
    }
  }
  if (id === "ecosystem" && width >= 1024) {
    await page.locator(".eco-tool").first().hover();
    await page.waitForTimeout(250);
    await section.locator("figure").screenshot({ path: `${out}/${width}-${id}-hover.png` });
  }
}
console.log(`horizontal overflow: ${overflow}px`);
console.log(errors.length ? errors.join("\n") : "no console errors");
await browser.close();
