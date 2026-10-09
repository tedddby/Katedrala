// The navigation over the film in forced colors, with the film's own copy of the rules removed (as once B1 deletes
// components/stage/film-global.css): the bar keeps the system's ground; past the film it is solid as usual.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const scheme of ["dark", "light"])
  for (const motion of ["no-preference", "reduce"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, forcedColors: "active", colorScheme: scheme, reducedMotion: motion });
    await page.goto("http://localhost:3100/lab/promoted/", { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const removed = await page.evaluate(() => {
      let n = 0;
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        for (let i = rules.length - 1; i >= 0; i--) {
          const r = rules[i];
          if (r instanceof CSSStyleRule && /data-kfilm/.test(r.selectorText) && /site-nav/.test(r.selectorText)) { sheet.deleteRule(i); n++; }
        }
      }
      return n;
    });
    const read = () => page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector(".site-nav"));
      return `${document.documentElement.dataset.kfilm} under=${document.documentElement.dataset.kfilmUnder !== undefined} bg ${cs.backgroundColor} rule ${cs.borderBottomColor}`;
    });
    await page.waitForTimeout(2000);
    const top = await read();
    await page.evaluate(() => { const h = document.querySelector("#how-it-works"); window.scrollTo({ top: h.getBoundingClientRect().top + scrollY, behavior: "instant" }); });
    await page.waitForTimeout(1500);
    console.log(`${scheme} ${motion} (removed ${removed}): top: ${top} | hinge: ${await read()}`);
    await page.close();
  }
await browser.close();
