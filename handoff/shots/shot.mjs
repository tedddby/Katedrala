// Screenshot harness: captures the page at desktop and mobile widths after the drawings settle.
// Usage: node shot.mjs <url> <outDir> [name] [--hover=MemberId] [--reduced]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const [url = "http://localhost:3100/", outDir = "./out", name = "page"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const hover = process.argv.find((a) => a.startsWith("--hover="))?.slice(8);
const reduced = process.argv.includes("--reduced");
const fullOnly = process.argv.includes("--full");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const viewports = [
  { tag: "desktop", width: 1440, height: 900, scale: 1 },
  { tag: "mobile", width: 390, height: 844, scale: 2 },
];
const errors = [];
for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    reducedMotion: reduced ? "reduce" : "no-preference",
    colorScheme: "dark",
  });
  const page = await context.newPage();
  page.on("console", (msg) => { if (msg.type() === "error" || msg.type() === "warning") errors.push(`[${vp.tag}] ${msg.type()}: ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`[${vp.tag}] pageerror: ${err.message}`));
  await page.goto(url, { waitUntil: "networkidle" });
  // Wait for every drawing to finish settling (or 6 s).
  await page.waitForFunction(() => [...document.querySelectorAll(".drawing")].every((d) => d.getAttribute("data-settle") === "done" || d.offsetParent === null), null, { timeout: 6000 }).catch(() => errors.push(`[${vp.tag}] drawings did not settle in 6s`));
  await page.waitForTimeout(400);
  if (hover && vp.tag === "desktop") {
    const target = page.locator(`.drawing-member[aria-label^="${hover},"] .drawing-hit`).first();
    await target.hover();
    await page.waitForTimeout(300);
  }
  if (!fullOnly) await page.screenshot({ path: `${outDir}/${name}-${vp.tag}-viewport.png` });
  await page.screenshot({ path: `${outDir}/${name}-${vp.tag}-full.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) errors.push(`[${vp.tag}] horizontal overflow: ${overflow}px`);
  await context.close();
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "no console errors, no overflow");
