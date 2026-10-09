// The terminal: per width and command, is the <pre> focusable, its role and name, does it overflow; print timing
// after a pointer choice and after a keyboard choice; reduced motion.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
const sizes = [[1440, 900, false], [768, 1024, false], [390, 844, true], [320, 700, true]];
for (const [width, height, touch] of sizes) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#developers").scrollIntoViewIfNeeded();
  const tabs = page.locator('#developers [role="tab"]');
  const n = await tabs.count();
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    if (touch) await tabs.nth(i).tap(); else await tabs.nth(i).click();
    await page.waitForTimeout(450);
    const r = await page.evaluate(() => {
      const pre = document.querySelector("#developers pre.terminal-body");
      const lines = [...pre.querySelectorAll(".terminal-line")];
      const last = lines.at(-1);
      const cs = getComputedStyle(last);
      const delay = parseFloat(cs.animationDelay) * (cs.animationDelay.endsWith("ms") ? 1 : 1000);
      const dur = parseFloat(cs.animationDuration) * (cs.animationDuration.endsWith("ms") ? 1 : 1000);
      return {
        id: document.querySelector('#developers [role="tab"][aria-selected="true"]').textContent.trim().split(/\s/)[0],
        lines: lines.length,
        printing: pre.classList.contains("is-printing"),
        lastLineEnds: Math.round(delay + dur),
        tabIndex: pre.getAttribute("tabindex"),
        role: pre.getAttribute("role"),
        name: pre.getAttribute("aria-label"),
        overflow: pre.scrollWidth - pre.clientWidth,
        fade: pre.dataset.overflow ?? null,
      };
    });
    console.log(`${width} pointer ${JSON.stringify(r)}`);
  }
  // Keyboard: focus the selected tab, arrow to the next one: the transcript shows at once.
  await page.locator('#developers [role="tab"][aria-selected="true"]').focus();
  await page.keyboard.press("ArrowRight");
  const k = await page.evaluate(() => ({ printing: document.querySelector("#developers pre.terminal-body").classList.contains("is-printing"), focused: document.activeElement.textContent.trim().split(/\s/)[0] }));
  console.log(`${width} keyboard ${JSON.stringify(k)}`);
  await context.close();
}
// Reduced motion: a pointer choice lands at once.
const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const p = await rm.newPage();
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.locator('#developers [role="tab"]').nth(1).click();
await p.waitForTimeout(60);
const anim = await p.evaluate(() => { const l = [...document.querySelectorAll("#developers .terminal-line")].at(-1); const cs = getComputedStyle(l); return { name: cs.animationName, duration: cs.animationDuration, opacity: cs.opacity }; });
console.log("reduced motion", JSON.stringify(anim));
await browser.close();
