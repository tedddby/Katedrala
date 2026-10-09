// One capture per plate per width (sticky drawings unstuck for the stitch, so the capture shows the layout once).
import { OUT, VIEWPORTS, launch, open, scrollTo, captureSection } from "./lib.mjs";
const browser = await launch();
const widths = (process.argv[2] ?? "1440,390").split(",");
const plates = (process.argv[3] ?? "architecture,gravity,entropy,rules").split(",");
for (const w of widths) {
  const vp = VIEWPORTS[w];
  const { page, context, messages } = await open(browser, vp);
  await page.addStyleTag({ content: ".entropy-figure { position: static !important; }" });
  for (const id of plates) {
    await scrollTo(page, `#${id}`, 0);
    await page.waitForTimeout(300);
    await captureSection(page, vp, id, `${OUT}plate-${w}-${id}.png`);
  }
  console.log(w, messages);
  await context.close();
}
await browser.close();
