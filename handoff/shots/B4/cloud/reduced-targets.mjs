import { VIEWPORTS, launch, open, scrollTo, frames } from "./lib.mjs";
const browser = await launch();
// Reduced motion: every change lands at once.
{
  const { page, context } = await open(browser, VIEWPORTS[1440], { reducedMotion: "reduce" });
  await scrollTo(page, "#entropy", 0);
  await page.locator("#entropy .commit").nth(5).click();
  await frames(page, 1);
  const e = await page.evaluate(() => [...document.querySelectorAll("#entropy .chain")].filter((g) => g.style.opacity !== "").length);
  await scrollTo(page, "#gravity", 0);
  await page.locator('#gravity [role="radio"]').nth(1).click();
  await frames(page, 1);
  const g = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.("#gravity")).length);
  await scrollTo(page, "#rules", 0);
  await page.locator("#rules .rules-toggle").click();
  await frames(page, 1);
  const r = await page.evaluate(() => [...document.querySelectorAll("#rules .chain")].filter((g) => g.style.opacity !== "").length);
  await scrollTo(page, "#architecture", 0);
  await page.locator("#architecture .kind-toggle").first().click();
  await frames(page, 1);
  const x = await page.evaluate(() => [...document.querySelectorAll("#architecture .chain")].filter((g) => g.style.opacity !== "").length);
  console.log("reduced motion: moving chains (entropy, rules, explorer)", e, r, x, "gravity animations", g);
  await context.close();
}
// Touch targets at 390.
for (const w of ["390", "320"]) {
  const { page, context } = await open(browser, VIEWPORTS[w]);
  const t = await page.evaluate(() => {
    const out = [];
    for (const id of ["architecture", "gravity", "entropy", "rules"]) {
      for (const el of document.querySelectorAll(`#${id} button, #${id} a, #${id} summary, #${id} [role="radio"], #${id} [tabindex="0"]`)) {
        if (!el.getClientRects().length) continue;
        if (el.closest("svg")) continue; // drawing members: their own hit circles
        const r = el.getBoundingClientRect();
        if (r.height < 44 || r.width < 44) out.push(`${id} ${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent).trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  });
  console.log(w, "controls under 44px:", t.length ? t.join(" | ") : "none");
  await context.close();
}
await browser.close();
