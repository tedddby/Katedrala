// The explorer at a width in a mode: the strip and sheet captured, plus geometry of the strip's rows.
import { OUT, VIEWPORTS, launch, open, scrollTo, boxOf, captureBox } from "./lib.mjs";
const browser = await launch();
for (const spec of (process.argv[2] ?? "1440:members").split(",")) {
  const [w, mode] = spec.split(":");
  const vp = VIEWPORTS[w] ?? { width: Number(w), height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
  const { page, context, messages } = await open(browser, vp);
  await scrollTo(page, "#architecture", 0);
  const radio = page.locator(`#architecture [role="radio"][data-mode="${mode}"]`);
  if ((await radio.getAttribute("aria-checked")) !== "true") await radio.click();
  await page.waitForTimeout(900);
  const geo = await page.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    const strip = document.querySelector("#architecture .explorer-strip");
    return {
      strip: r(strip),
      kids: [...strip.children].map((c) => `${c.getAttribute("aria-label")}:${r(c).join(",")}`),
      sheet: r(document.querySelector("#architecture .explorer-sheet")),
      aside: r(document.querySelector("#architecture .explorer-aside")),
      inspector: r(document.querySelector("#architecture .inspector")),
      doc: document.documentElement.scrollWidth,
    };
  });
  console.log(spec, JSON.stringify(geo), messages);
  const box = await boxOf(page, "#architecture .grid-12");
  await captureBox(page, vp, { left: 0, top: box.top - 16, width: vp.width, height: box.height + 32 }, `${OUT}explorer-${w}-${mode}.png`);
  await context.close();
}
await browser.close();
