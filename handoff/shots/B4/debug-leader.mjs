import { VIEWPORTS, launch, open, scrollTo } from "./lib.mjs";
const browser = await launch();
const { page, context } = await open(browser, VIEWPORTS[1440]);
await scrollTo(page, "#rules", 0);
await page.waitForTimeout(500);
console.log(await page.evaluate(() => {
  const root = document.querySelector("#rules .rules-layout");
  const q = (s) => { const e = root.querySelector(s); return e ? JSON.stringify(e.getBoundingClientRect()) : "none"; };
  return {
    root: !!root,
    code: q(".code-block"), panel: q(".violation"), first: q("#rules-config-10"), last: q("#rules-config-13"),
    mark: q(".violation-landscape .rules-break"),
    ids: [...root.querySelectorAll("[id^=rules-config]")].map((e) => e.id).slice(0, 20),
    svg: root.querySelector(".rules-leader") ? "yes" : "no",
  };
}));
await context.close(); await browser.close();
