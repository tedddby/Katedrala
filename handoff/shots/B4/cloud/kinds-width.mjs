import { VIEWPORTS, launch, open, scrollTo } from "./lib.mjs";
const browser = await launch();
for (const w of ["390", "360", "430", "320"]) {
  const { page, context } = await open(browser, VIEWPORTS[w]);
  await scrollTo(page, "#architecture", 0);
  const radio = page.locator('#architecture [role="radio"][data-mode="members"]');
  if ((await radio.getAttribute("aria-checked")) !== "true") await radio.click();
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const g = document.querySelector("#architecture .explorer-kinds");
    const strip = document.querySelector("#architecture .explorer-strip");
    const cs = getComputedStyle(strip);
    return { strip: strip.getBoundingClientRect().width, pad: cs.paddingLeft, group: g.getBoundingClientRect().width, gap: getComputedStyle(g).columnGap, toggles: [...g.children].map((b) => `${b.textContent}:${b.getBoundingClientRect().width.toFixed(1)}x${b.getBoundingClientRect().height.toFixed(0)}`) };
  });
  console.log(w, JSON.stringify(r));
  await context.close();
}
await browser.close();
