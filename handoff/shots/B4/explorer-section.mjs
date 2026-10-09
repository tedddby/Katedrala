import { OUT, VIEWPORTS, launch, open, scrollTo, captureSection } from "./lib.mjs";
const browser = await launch();
for (const w of (process.argv[2] ?? "1440,390").split(",")) {
  const vp = VIEWPORTS[w];
  const { page, context, messages } = await open(browser, vp);
  await scrollTo(page, "#architecture", 0);
  await page.waitForTimeout(500);
  await captureSection(page, vp, "architecture", `${OUT}architecture-${w}-rest.png`);
  // Select OrderService (members view) by keyboard.
  const members = page.locator('#architecture [role="radio"][data-mode="members"]');
  if ((await members.getAttribute("aria-checked")) !== "true") await members.click();
  await page.waitForTimeout(500);
  await page.locator('#architecture [data-id="OrderService"]').click({ force: true });
  await page.waitForTimeout(500);
  await captureSection(page, vp, "architecture", `${OUT}architecture-${w}-orderservice.png`);
  // Toggle kinds off/on by pointer: chain motion timing.
  const t = await page.evaluate(() => [...document.querySelectorAll("#architecture .chain")].length);
  console.log(w, "chains", t, messages);
  await context.close();
}
await browser.close();
