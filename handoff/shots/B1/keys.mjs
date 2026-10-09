// Keyboard sanity: the Tab order from the top of the page with the film at a beat, whether each focused element is
// visible (on screen, clear of the bar, not transparent), and the page keys stepping through the acts' stops.
// usage: node keys.mjs <W>x<H> <t of Act I to start at>
import { chromium } from "playwright-core";
const [size, tArg = "0.5"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width, height } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 30000 });
await page.waitForTimeout(2000);
await page.evaluate((t) => {
  const film = window.__kfilm;
  const P = film.clock.progressOf(0, t);
  const tr = film.trigger;
  window.scrollTo({ top: tr.start + P * (tr.end - tr.start), behavior: "instant" });
}, Number(tArg));
await page.waitForTimeout(1500);
const describe = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { el: "body" };
    const r = el.getBoundingClientRect();
    let opacity = 1;
    for (let n = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
    const nav = document.querySelector(".site-nav")?.getBoundingClientRect().bottom ?? 64;
    return {
      el: `${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)}`,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      onScreen: r.bottom > 0 && r.top < innerHeight,
      clearOfBar: r.top >= nav || el.closest(".site-nav") !== null,
      opacity: +opacity.toFixed(2),
      outline: getComputedStyle(el).outlineStyle + " " + getComputedStyle(el).outlineColor,
    };
  });
const tabs = [];
for (let i = 0; i < 12; i++) {
  await page.keyboard.press("Tab");
  await page.waitForTimeout(350);
  tabs.push(await describe());
}
const back = [];
for (let i = 0; i < 3; i++) {
  await page.keyboard.press("Shift+Tab");
  await page.waitForTimeout(350);
  back.push(await describe());
}
// Page keys from the top of the film: each press goes to the next stop.
await page.evaluate(() => {
  document.activeElement?.blur();
  window.scrollTo({ top: 0, behavior: "instant" });
});
await page.waitForTimeout(800);
const steps = [];
for (let i = 0; i < 16; i++) {
  await page.keyboard.press("PageDown");
  await page.waitForTimeout(1300);
  steps.push(await page.evaluate(() => `${window.__kfilm.pos.id} ${window.__kfilm.pos.t.toFixed(3)}`));
}
console.log(JSON.stringify({ tabs, back, steps }, null, 1));
await browser.close();
