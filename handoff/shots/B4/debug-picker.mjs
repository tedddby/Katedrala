import { launch, open } from "./lib.mjs";
const browser = await launch();
const { page, context } = await open(browser, { width: 1024, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
console.log(await page.evaluate(() => {
  const c = document.querySelector("#gravity .choices");
  const cs = getComputedStyle(c);
  const b = getComputedStyle(c.firstElementChild);
  const rules = [];
  for (const sheet of document.styleSheets) { try { for (const r of sheet.cssRules) { const t = r.cssText; if (t.includes("choices") || (t.includes("@container") && t.includes("choice"))) rules.push(t.slice(0, 300)); if (r.cssRules) for (const rr of r.cssRules) { const tt = rr.cssText; if (tt.includes("choice") && tt.includes("container")) rules.push(tt.slice(0, 300)); } } } catch {} }
  return { width: c.getBoundingClientRect().width, containerType: cs.containerType, basis: b.flexBasis, rules };
}));
await context.close(); await browser.close();
