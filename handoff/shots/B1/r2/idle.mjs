// Idle and off screen. At each moment (an act and its local t): let the film settle, then count over 2 s the
// director's ticks, the stage's drawn frames and every requestAnimationFrame callback on the page. Off screen (the
// preview route gets the sections' length after the film): every rAF callback, from the moment the film leaves.
// usage: node idle.mjs [W]x[H]
import { chromium } from "playwright-core";
const [size = "1440x900"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const mobile = width < 600;
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
await page.addInitScript(() => {
  const orig = window.requestAnimationFrame.bind(window);
  window.__rafN = 0;
  window.requestAnimationFrame = (cb) => orig((t) => { window.__rafN++; cb(t); });
});
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined && window.__kfilm?.trigger, null, { timeout: 60000 });
await page.evaluate(() => {
  const spacer = document.createElement("div");
  spacer.style.height = "3000px";
  document.querySelector("main").append(spacer);
});
await page.waitForTimeout(14000);
const count = (ms = 2000) =>
  page.evaluate(
    (ms) =>
      new Promise((res) => {
        const film = window.__kfilm;
        const tick = film.tick;
        const frame = film.stage.frame.bind(film.stage);
        let ticks = 0;
        let drawn = 0;
        film.tick = (now) => { ticks++; tick(now); };
        film.stage.frame = (s) => { const d = frame(s); if (d) drawn++; return d; };
        const raf0 = window.__rafN;
        setTimeout(() => {
          film.tick = tick;
          film.stage.frame = frame;
          res({ ticks, drawn, rafAll: window.__rafN - raf0 });
        }, ms);
      }),
    ms,
  );
const go = (index, t) =>
  page.evaluate(([index, t]) => {
    const film = window.__kfilm;
    const track = document.querySelector("[data-film-track]");
    const top = track.getBoundingClientRect().top + scrollY;
    window.scrollTo({ top: top + film.clock.progressOf(index, t) * (track.offsetHeight - innerHeight), behavior: "instant" });
  }, [index, t]);
const out = [];
const moments = [["hero", 0, 0], ["crown hold", 0, 0.97], ["act II", 1, 0.5], ["act III", 2, 0.6], ["landing", 3, 0.6], ["landing end", 3, 1]];
for (const [name, index, t] of moments) {
  await go(index, t);
  await page.waitForTimeout(name === "hero" ? 3000 : 3500);
  out.push({ name, at: await page.evaluate(() => `${window.__kfilm.pos.id} ${window.__kfilm.pos.t.toFixed(3)}`), ...(await count()) });
}
// Off screen: every rAF callback, in half-second windows from the moment the film leaves.
await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
const windows = [];
for (let i = 0; i < 10; i++) {
  const n0 = await page.evaluate(() => window.__rafN);
  await page.waitForTimeout(500);
  windows.push((await page.evaluate(() => window.__rafN)) - n0);
}
out.push({ name: "off screen, rAF per 0.5 s from leaving", windows });
out.push({ name: "off screen, settled", ...(await count()) });
// And back: the film follows the scroll again.
await go(0, 0.5);
await page.waitForTimeout(1500);
out.push({ name: "back in the film", at: await page.evaluate(() => `${window.__kfilm.pos.id} ${window.__kfilm.pos.t.toFixed(3)}`) });
console.log(JSON.stringify(out, null, 0).replace(/\},\{/g, "},\n{"));
await browser.close();
