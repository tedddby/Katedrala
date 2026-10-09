// Page keys while the film is pinned: Space, Page Down and Page Up go one stop at a time through every act's stops
// (clock.stops); past the film and inside controls they do what they always do.
// usage: node pagekeys.mjs [W]x[H]
import { chromium } from "playwright-core";
const [size = "1440x900"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const mobile = width < 600;
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
await page.waitForTimeout(2500);
const stops = await page.evaluate(() => window.__kfilm.clock.stops.map((s) => +s.toFixed(4)));
const where = () => page.evaluate(() => {
  const f = window.__kfilm;
  const tr = f.trigger;
  return { P: +((scrollY - tr.start) / (tr.end - tr.start)).toFixed(4), pos: `${f.pos.id} ${f.pos.t.toFixed(3)}`, y: Math.round(scrollY) };
});
const fwd = [];
for (let i = 0; i < stops.length + 2; i++) {
  await page.keyboard.press(i % 2 ? "PageDown" : "Space");
  await page.waitForTimeout(1100);
  fwd.push(await where());
}
const back = [];
for (let i = 0; i < 4; i++) {
  await page.keyboard.press(i % 2 ? "PageUp" : "Shift+Space");
  await page.waitForTimeout(1100);
  back.push(await where());
}
// With focus in a control, the keys are the control's (a button: Space presses it, the page does not move).
await page.evaluate(() => {
  const f = window.__kfilm;
  const tr = f.trigger;
  window.scrollTo({ top: tr.start + f.clock.progressOf(0, 0.3) * (tr.end - tr.start), behavior: "instant" });
  const b = document.createElement("button");
  b.textContent = "probe";
  b.style.cssText = "position:fixed;left:8px;top:120px;z-index:99";
  document.body.append(b);
  b.focus();
});
await page.waitForTimeout(800);
const before = await where();
await page.keyboard.press("PageDown");
await page.waitForTimeout(1100);
const inControl = { before, after: await where() };
const matched = fwd.map((w) => stops.find((s) => Math.abs(s - w.P) < 0.0015) ?? null);
console.log(JSON.stringify({ stops, fwd, matched, back, inControl }, null, 0));
await browser.close();
