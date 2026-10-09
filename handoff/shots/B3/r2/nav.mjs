// Plan 4.4's nav acceptance on a page with the film: the bar's computed ground at the top, at film progress 0.3 and
// 0.9, past the film (the hinge plate under it) and at the page's end; in film and still modes. With --own, the
// film's own copy of the rules (components/stage/film-global.css, unlayered) is removed from the page first, so only
// styles/nav.css decides (what the page does once B1 deletes that file).
// usage: node nav.mjs <url> <W>x<H> [--reduced] [--nowebgl] [--touch] [--own] [--forced]
import { chromium } from "playwright-core";
const [url = "http://localhost:3100/lab/promoted/", size = "1440x900", ...rest] = process.argv.slice(2);
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
  forcedColors: flag("--forced") ? "active" : "none",
});
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(2500);
let removed = 0;
if (flag("--own"))
  removed = await page.evaluate(() => {
    let n = 0;
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (let i = rules.length - 1; i >= 0; i--) {
        const r = rules[i];
        if (r instanceof CSSStyleRule && /data-kfilm/.test(r.selectorText) && /site-nav/.test(r.selectorText)) {
          sheet.deleteRule(i);
          n++;
        }
      }
    }
    return n;
  });
const state = () =>
  page.evaluate(() => {
    const nav = document.querySelector(".site-nav");
    const cs = getComputedStyle(nav);
    const h = document.documentElement.dataset;
    const under = document.elementsFromPoint(innerWidth / 2, 70).find((e) => e.closest("section"));
    return {
      y: Math.round(scrollY),
      mode: h.kfilm ?? "-",
      under: h.kfilmUnder !== undefined,
      bg: cs.backgroundColor,
      rule: cs.borderBottomColor,
      anim: cs.animationName,
      below: under?.closest("section")?.id ?? "-",
    };
  });
const go = async (where) => {
  await page.evaluate((where) => {
    const track = document.querySelector("[data-film-track]");
    const top = track.getBoundingClientRect().top + scrollY;
    const span = track.offsetHeight - innerHeight;
    const hinge = document.querySelector("#how-it-works");
    const y =
      where === "hinge"
        ? hinge.getBoundingClientRect().top + scrollY - 80
        : where === "end"
          ? document.documentElement.scrollHeight
          : where === "track-end"
            ? top + track.offsetHeight - innerHeight + 2
            : top + where * span;
    window.scrollTo({ top: y, behavior: "instant" });
  }, where);
  await page.waitForTimeout(700);
  return state();
};
console.log(`${size} ${url} ${rest.join(" ")}${flag("--own") ? ` (film-global rules removed: ${removed})` : ""}`);
const rows = [["top", await state()]];
for (const p of [0.3, 0.9, "track-end", "hinge", "end", 0.5, 0])
  rows.push([String(p), await go(p)]);
for (const [k, s] of rows)
  console.log(`  ${k.padEnd(10)} y ${String(s.y).padStart(6)}  ${s.mode.padEnd(5)} under=${String(s.under).padEnd(5)} bg ${s.bg}  rule ${s.rule}  anim ${s.anim}  over ${s.below}`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
