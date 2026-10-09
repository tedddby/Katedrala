// "Skip the film" once the film is on the page (simulated: an element with the film's first anchor id is added to
// main): shown on focus as the second Tab stop, and it lands the hinge's board under the navigation.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
for (const [w, h, touch] of [[1440, 900, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  const before = await page.evaluate(() => getComputedStyle(document.querySelector("a[data-skip='film']")).display);
  await page.evaluate(() => { const a = document.createElement("span"); a.id = "film-start"; document.querySelector("main").prepend(a); });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => getComputedStyle(document.querySelector("a[data-skip='film']")).display);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => { const a = document.activeElement; const b = a.getBoundingClientRect(); return { text: a.innerText, top: Math.round(b.top), left: Math.round(b.left), visible: b.top >= 0 && b.bottom <= innerHeight }; });
  await page.screenshot({ path: `r1/skipfilm-focus-${w}.png`, clip: { x: 0, y: 0, width: w, height: 160 } });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  const landed = await page.evaluate(() => {
    const board = document.querySelector("#how-it-works .hinge-board").getBoundingClientRect();
    const nav = document.querySelector("body > header").getBoundingClientRect();
    return { hash: location.hash, boardTop: Math.round(board.top), navBottom: Math.round(nav.bottom), clearOfNav: board.top >= nav.bottom };
  });
  await page.keyboard.press("Tab");
  const next = await page.evaluate(() => { const a = document.activeElement; return { text: (a.innerText || "").slice(0, 40), inHinge: !!a.closest("#how-it-works"), unit: a.closest("section[id]")?.id ?? a.closest("header,footer")?.tagName }; });
  console.log(`${w}: hidden before film ${before}, shown with film ${after}; second Tab ${JSON.stringify(focused)}; after Enter ${JSON.stringify(landed)}; next Tab ${JSON.stringify(next)}`);
  await ctx.close();
}
await browser.close();
