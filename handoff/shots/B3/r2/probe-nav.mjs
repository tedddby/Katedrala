// The navigation over the film: at the top, at film progress P (0..1 of the pinned track) and past the film.
// usage: node probe-nav.mjs <url> <W>x<H> [--reduced] [--nowebgl] [--touch]
import { chromium } from "playwright-core";
const [url = "http://localhost:3100/lab/cinematic/", size = "1440x900", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const flag = (f) => rest.includes(f);
const args = flag("--nowebgl") ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const touch = flag("--touch");
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: touch ? 3 : 1,
  isMobile: touch,
  hasTouch: touch,
  reducedMotion: flag("--reduced") ? "reduce" : "no-preference",
});
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(3000);
const state = () =>
  page.evaluate(() => {
    const nav = document.querySelector(".site-nav");
    const cs = getComputedStyle(nav);
    const h = document.documentElement.dataset;
    return {
      y: Math.round(scrollY),
      kfilm: h.kfilm ?? "-",
      under: h.kfilmUnder !== undefined,
      ready: h.kfilmReady !== undefined,
      bg: cs.backgroundColor,
      border: cs.borderBottomColor,
      anim: cs.animationName,
    };
  });
const go = async (where) => {
  await page.evaluate((where) => {
    const track = document.querySelector("[data-film-track]");
    const top = track.getBoundingClientRect().top + scrollY;
    const span = track.offsetHeight - innerHeight;
    const y = where === "past" ? top + track.offsetHeight + 200 : where === "end" ? document.documentElement.scrollHeight : top + where * span;
    window.scrollTo({ top: y, behavior: "instant" });
  }, where);
  await page.waitForTimeout(900);
  return state();
};
console.log(size, url, rest.join(" "));
console.log("top   ", JSON.stringify(await state()));
for (const p of [0.3, 0.9, 1, "past", "end"]) console.log(String(p).padEnd(6), JSON.stringify(await go(p)));
console.log("back 0.5", JSON.stringify(await go(0.5)));
if (errors.length) console.log(errors.join("\n"));
await browser.close();
