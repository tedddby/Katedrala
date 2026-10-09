// Console errors and warnings of a route, with where they came from, at one size.
// usage: node errs.mjs <url> <W>x<H> [--touch] [--reduced] [--scroll]
import { chromium } from "playwright-core";
const [url, size = "390x844", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const flag = (f) => rest.includes(f);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const touch = flag("--touch");
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: touch ? 2 : 1, isMobile: touch, hasTouch: touch, reducedMotion: flag("--reduced") ? "reduce" : "no-preference" });
const out = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") out.push(`${m.type()}: ${m.text().slice(0, 400)}\n    at ${JSON.stringify(m.location())}`);
});
page.on("pageerror", (e) => out.push(`pageerror: ${e.message}\n${(e.stack ?? "").split("\n").slice(0, 6).join("\n")}`));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(4000);
if (flag("--scroll")) {
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(120); }
  await page.waitForTimeout(1500);
}
console.log(`${url} ${size} ${rest.join(" ")}: ${out.length} messages`);
for (const o of out) console.log(o);
await browser.close();
