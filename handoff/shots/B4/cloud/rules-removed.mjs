import { OUT, VIEWPORTS, launch, open, scrollTo, boxOf, captureBox } from "./lib.mjs";
const browser = await launch();
for (const w of ["1440", "390"]) {
  const { page, context } = await open(browser, VIEWPORTS[w]);
  await scrollTo(page, "#rules", 0);
  await page.locator("#rules .rules-toggle").click();
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => ({
    status: document.querySelector('#rules [role="status"].data')?.textContent,
    report: document.querySelector("#rules .violation-report").innerText.replace(/\n+/g, " | "),
    leader: getComputedStyle(document.querySelector("#rules .rules-leader path") ?? document.body).opacity,
    brk: [...document.querySelectorAll("#rules .rules-break")].map((b) => getComputedStyle(b).opacity).join(","),
    marked: document.querySelectorAll("#rules [data-marked]").length,
    button: document.querySelector("#rules .rules-toggle").textContent,
    img: document.querySelector("#rules .violation-body").getAttribute("aria-label"),
  }));
  console.log(w, JSON.stringify(r));
  const box = await boxOf(page, "#rules .rules-layout");
  await captureBox(page, VIEWPORTS[w], { left: 0, top: box.top - 10, width: VIEWPORTS[w].width, height: box.height + 20 }, `${OUT}rules-${w}-removed.png`);
  await context.close();
}
await browser.close();
