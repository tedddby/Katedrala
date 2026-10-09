import { VIEWPORTS, launch, open } from "./lib.mjs";
const browser = await launch();
for (const w of ["1440", "390"]) {
  const { page, context } = await open(browser, VIEWPORTS[w]);
  const r = await page.evaluate(() => Object.fromEntries(["architecture", "gravity", "entropy", "rules"].map((id) => [id, Math.round(document.getElementById(id).getBoundingClientRect().height)])));
  console.log(w, JSON.stringify(r), "page", await page.evaluate(() => document.documentElement.scrollHeight));
  await context.close();
}
await browser.close();
