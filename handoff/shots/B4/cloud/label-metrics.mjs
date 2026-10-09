// Measures each member name's box in plan units (getBBox) at the explorer's font size, at a width.
import { VIEWPORTS, launch, open, scrollTo } from "./lib.mjs";
const browser = await launch();
for (const w of (process.argv[2] ?? "1440").split(",")) {
  const vp = VIEWPORTS[w];
  const { page, context } = await open(browser, vp);
  await scrollTo(page, "#architecture", 0);
  const members = page.locator('#architecture [role="radio"][data-mode="members"]');
  if ((await members.getAttribute("aria-checked")) !== "true") await members.click();
  await page.waitForTimeout(800);
  const out = await page.evaluate(() => {
    const svg = document.querySelector("#architecture .explorer-sheet > svg");
    const k = svg.getBoundingClientRect().width / 1000;
    const rows = [...svg.querySelectorAll(".plan-member")].map((g) => {
      const t = g.querySelector(".plan-label");
      const b = t.getBBox();
      const fs = parseFloat(getComputedStyle(t).fontSize);
      return { id: t.textContent, fs, w: +b.width.toFixed(2), h: +b.height.toFixed(2), x: +b.x.toFixed(2), y: +b.y.toFixed(2), adv: +(b.width / fs / t.textContent.length).toFixed(4) };
    });
    const bays = [...svg.querySelectorAll(".plan-bay-label")].map((t) => { const b = t.getBBox(); const fs = parseFloat(getComputedStyle(t).fontSize); return { id: t.textContent, fs, w: +b.width.toFixed(2), adv: +(b.width / fs / t.textContent.length).toFixed(4), h: +b.height.toFixed(2) }; });
    return { k, unit: getComputedStyle(svg).getPropertyValue("--member-unit"), rows, bays };
  });
  console.log(w, JSON.stringify(out, null, 0));
  await context.close();
}
await browser.close();
