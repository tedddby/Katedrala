// Keyboard walk through the film's controls: focus reveal to E4 for the record, to the landing for its controls.
import { chromium } from "playwright-core";
const [w, h] = (process.argv[2] ?? "1440x900").split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const mobile = w < 600;
const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined && window.__kfilm?.trigger, null, { timeout: 60000 });
await page.waitForTimeout(2000);
const where = () => page.evaluate(() => {
  const f = window.__kfilm;
  const el = document.activeElement;
  const r = el.getBoundingClientRect();
  const cs = (e) => { let o = 1; for (let n = e; n && n !== document.documentElement; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  const pos = f.clock.at(f.pRaw);
  return { el: `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} ${el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 30)}`, act: pos.id, t: +pos.t.toFixed(3), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], opacity: +cs(el).toFixed(2), visible: r.bottom > 64 && r.top < innerHeight && r.width > 0 };
});
await page.focus('a[href^="https://github.com"]');
console.log("start", JSON.stringify(await where()));
for (let i = 0; i < 8; i++) {
  await page.keyboard.press("Tab");
  await page.waitForTimeout(1600);
  console.log("Tab", i + 1, JSON.stringify(await where()));
}
for (let i = 0; i < 6; i++) {
  await page.keyboard.press("Shift+Tab");
  await page.waitForTimeout(1600);
  console.log("Shift+Tab", i + 1, JSON.stringify(await where()));
}
await page.screenshot({ path: `r2/keys-${w}.png` });
await browser.close();
