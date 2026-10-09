// After each jump: the bar's ground sampled every animation frame for 3 s (time, data-kfilm-under, background),
// and the long tasks in that window, to tell the transition from a busy main thread.
// usage: node nav-timeline.mjs <url> <W>x<H> [--own] [--reduced]
import { chromium } from "playwright-core";
const [url = "http://localhost:3100/lab/promoted/", size = "1440x900", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const flag = (f) => rest.includes(f);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width, height }, reducedMotion: flag("--reduced") ? "reduce" : "no-preference" });
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(3000);
if (flag("--own"))
  await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (let i = rules.length - 1; i >= 0; i--) {
        const r = rules[i];
        if (r instanceof CSSStyleRule && /data-kfilm/.test(r.selectorText) && /site-nav/.test(r.selectorText)) sheet.deleteRule(i);
      }
    }
  });
for (const where of [0.3, "hinge", 0.5, 0.95, "hinge", 0]) {
  const log = await page.evaluate(
    (where) =>
      new Promise((resolve) => {
        const track = document.querySelector("[data-film-track]");
        const top = track.getBoundingClientRect().top + scrollY;
        const span = track.offsetHeight - innerHeight;
        const hinge = document.querySelector("#how-it-works");
        const y = where === "hinge" ? hinge.getBoundingClientRect().top + scrollY - 80 : top + where * span;
        const nav = document.querySelector(".site-nav");
        const long = [];
        const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => long.push(Math.round(e.duration))));
        po.observe({ type: "longtask", buffered: false });
        const t0 = performance.now();
        const out = [];
        window.scrollTo({ top: y, behavior: "instant" });
        const step = () => {
          const t = Math.round(performance.now() - t0);
          out.push([t, document.documentElement.dataset.kfilmUnder !== undefined ? "U" : "-", getComputedStyle(nav).backgroundColor]);
          if (t < 3000) requestAnimationFrame(step);
          else {
            po.disconnect();
            resolve({ where, out, long });
          }
        };
        requestAnimationFrame(step);
      }),
    where,
  );
  const runs = [];
  for (const [t, u, bg] of log.out) {
    const k = `${u} ${bg}`;
    if (runs.length === 0 || runs.at(-1).k !== k) runs.push({ k, t });
  }
  const shown = runs.length > 8 ? [...runs.slice(0, 3), { k: `... ${runs.length - 5} more ...`, t: "" }, ...runs.slice(-2)] : runs;
  console.log(`jump to ${where}: ${log.out.length} frames in 3 s, long tasks [${log.long.join(", ")}]`);
  for (const r of shown) console.log(`   ${String(r.t).padStart(5)} ms  ${r.k}`);
}
await browser.close();
