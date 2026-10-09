import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 600, hasTouch: w < 600 });
  await page.goto("http://localhost:3100/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const out = {};
    out.height = document.documentElement.scrollHeight;
    out.sections = [...document.querySelectorAll("main > section, main > div > section, footer")].map((s) => {
      const r = s.getBoundingClientRect();
      return `${s.id || s.tagName}:${Math.round(r.height)}`;
    });
    const cta = document.querySelector("#get-started-title");
    if (cta) { const cs = getComputedStyle(cta); out.cta = [cs.fontVariationSettings, cs.fontSize, cs.fontWeight, cs.letterSpacing]; }
    const h2 = document.querySelector("#gravity-title");
    if (h2) { const cs = getComputedStyle(h2); out.h2 = [cs.fontVariationSettings, cs.fontSize, cs.fontWeight]; }
    const focusables = [...document.querySelectorAll("a[href], button, select, input, textarea, summary, [tabindex]")].filter((el) => el.tabIndex >= 0 && !el.closest("[hidden]") && el.getClientRects().length > 0);
    out.focusStops = focusables.length;
    return out;
  });
  console.log(w, JSON.stringify(info));
  await page.close();
}
await browser.close();
