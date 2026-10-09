import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
for (const spacing of [false, true]) {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  if (spacing) await page.addStyleTag({ content: "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }" });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const frame = document.querySelector("header .frame");
    const kids = [...frame.children].map((k) => { const b = k.getBoundingClientRect(); const cs = getComputedStyle(k); return { el: k.tagName + "." + String(k.className).slice(0, 40), l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), ml: cs.marginLeft, mr: cs.marginRight, disp: cs.display }; });
    const clone = frame.cloneNode(true);
    clone.style.cssText = "position:absolute;left:0;top:0;width:min-content;visibility:hidden";
    document.body.append(clone);
    const minContent = clone.getBoundingClientRect().width;
    clone.style.width = "max-content";
    const maxContent = clone.getBoundingClientRect().width;
    clone.remove();
    const word = document.querySelector("header a[href='#top']");
    return { innerWidth, kids, minContent, maxContent, wordmark: word.getBoundingClientRect().width, gap: getComputedStyle(frame).columnGap };
  });
  console.log(spacing ? "SPACING" : "NORMAL", JSON.stringify(r));
  await ctx.close();
}
await browser.close();
