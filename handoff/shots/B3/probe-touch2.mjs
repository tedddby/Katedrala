// Does touch emulation survive screenshots, with and without isMobile? And is a non-fullPage clip viewport-relative?
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const isMobile of [false, true]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile, hasTouch: true, colorScheme: "dark" });
  const page = await context.newPage();
  const mq = async () => {
    const r = await page.evaluate(() => [matchMedia("(pointer: coarse)").matches, matchMedia("(hover: none)").matches, document.documentElement.scrollHeight, document.documentElement.clientWidth]);
    return r.join(",");
  };
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const log = [`isMobile=${isMobile} load ${await mq()}`];
  await page.screenshot();
  log.push(`after viewport shot ${await mq()}`);
  await page.locator("#gravity").screenshot();
  log.push(`after tall element shot ${await mq()}`);
  await page.locator("#get-started").screenshot();
  log.push(`after short element shot ${await mq()}`);
  // clip semantics
  await page.evaluate(() => scrollTo({ top: 3000, behavior: "instant" }));
  await page.waitForTimeout(200);
  const a = PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 200 }, scale: "css" }));
  const b = PNG.sync.read(await page.screenshot({ scale: "css" }));
  let same = 0, n = 0;
  for (let y = 0; y < 200; y += 7) for (let x = 0; x < 390; x += 7) { const i = (y * 390 + x) * 4; n++; if (Math.abs(a.data[i] - b.data[i]) < 3 && Math.abs(a.data[i+1] - b.data[i+1]) < 3) same++; }
  log.push(`clip y=0 after scrolling to 3000 matches viewport top: ${Math.round((same / n) * 100)}% (scrollY ${await page.evaluate(() => scrollY)})`);
  log.push(`end ${await mq()}`);
  console.log(log.join("\n"));
  await context.close();
}
await browser.close();
