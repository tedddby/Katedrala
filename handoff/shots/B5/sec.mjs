// Captures B5's sections at several widths for visual review.
// Usage: node sec.mjs <outDir> <widths: 1440x900,390x844> <ids: history,developers> [--reduced] [--scale=device]
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const out = resolve(args[0] ?? "./out");
const sizes = (args[1] ?? "1440x900,390x844").split(",").map((s) => s.split("x").map(Number));
const ids = (args[2] ?? "history,developers,open-source,ecosystem").split(",");
const reduced = args.includes("--reduced");
const device = args.includes("--scale=device");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
for (const [width, height] of sizes) {
  const phone = width < 640;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: phone ? 2 : 1,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "body > header, body > a.skip-link { visibility: hidden !important; }" });
  for (const id of ids) {
    const el = page.locator(`#${id}`);
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await el.screenshot({ path: join(out, `${width}-${id}.png`), scale: device ? "device" : "css" });
  }
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  console.log(`${width}x${height}: scrollWidth ${overflow.sw} clientWidth ${overflow.cw}${errors.length ? " errors: " + errors.join(" | ") : ""}`);
  await context.close();
}
await browser.close();
