// The page's ending and its chrome: the final statement (headline width axis, actions, the ground's span), the
// footer as a title block (cells, hairlines, targets), and the skip links (order, visibility on focus, the film
// link's gate). Screenshots of the final statement through the footer.
// Usage: node ending.mjs <outDir> [widths] [--url=http://localhost:3100/]
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const out = resolve(positional[0] ?? "./ending");
mkdirSync(out, { recursive: true });
const widths = (positional[1] ?? "1440x900,1024x768,768x1024,390x844,320x640")
  .split(",")
  .map((s) => s.split("x").map(Number));
const URL_ = (args.find((a) => a.startsWith("--url=")) ?? "--url=http://localhost:3100/").slice(6);
const browser = await chromium.launch({ channel: "msedge" });
const report = {};
for (const [w, h] of widths) {
  const touch = w < 768;
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: touch ? 2 : 1,
    isMobile: touch,
    hasTouch: touch,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const lh = (el) => parseFloat(getComputedStyle(el).lineHeight);
    const sec = document.querySelector("#get-started");
    const h2 = sec.querySelector("h2");
    const s = getComputedStyle(h2);
    const ground = sec.querySelector(".statement-ground").getBoundingClientRect();
    const buttons = [...sec.querySelectorAll("a")].map((a) => ({
      name: a.innerText.replace(/\s+/g, " ").trim(),
      srOnly: [...a.querySelectorAll(".sr-only")].map((x) => x.textContent),
      h: Math.round(a.getBoundingClientRect().height),
      w: Math.round(a.getBoundingClientRect().width),
      lines: Math.round(a.getBoundingClientRect().height / 44),
    }));
    const lastButton = [...sec.querySelectorAll("a")].at(-1).getBoundingClientRect();
    const footer = document.querySelector("body > footer");
    const cells = [...footer.querySelectorAll(".footer-cell")].map((c) => {
      const b = c.getBoundingClientRect();
      return { l: Math.round(b.left), t: Math.round(b.top + scrollY), w: Math.round(b.width), h: Math.round(b.height) };
    });
    const links = [...footer.querySelectorAll("a")].map((a) => {
      const b = a.getBoundingClientRect();
      return { name: a.innerText, w: Math.round(b.width), h: Math.round(b.height), wraps: b.height > 30 && getComputedStyle(a).paddingTop === "4px" };
    });
    const skips = [...document.querySelectorAll("body > a.skip-link")].map((a) => ({
      text: a.innerText,
      href: a.getAttribute("href"),
      display: getComputedStyle(a).display,
    }));
    return {
      vw: document.documentElement.clientWidth,
      scrollW: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      statement: {
        height: Math.round(sec.getBoundingClientRect().height),
        h2: { size: s.fontSize, weight: s.fontWeight, wdth: s.fontVariationSettings, lines: Math.round(h2.getBoundingClientRect().height / lh(h2)), tracking: s.letterSpacing },
        buttons,
        ground: { left: ground.left, right: ground.right, height: ground.height, gapAbove: Math.round(ground.top - lastButton.bottom) },
      },
      footer: { height: Math.round(footer.getBoundingClientRect().height), gapFromGround: Math.round(footer.getBoundingClientRect().top - ground.bottom), cells, links },
      skips,
    };
  });
  // Keyboard: the first Tab stops, and whether each focused skip link is visible.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => {
    const a = document.activeElement;
    const b = a.getBoundingClientRect();
    return { text: a.innerText, visible: b.bottom > 0 && b.top < innerHeight, top: Math.round(b.top) };
  });
  await page.keyboard.press("Tab");
  const second = await page.evaluate(() => {
    const a = document.activeElement;
    return { text: a.innerText || a.getAttribute("aria-label"), tag: a.tagName };
  });
  r.tab = [first, second];
  r.errors = errors;
  report[`${w}x${h}`] = r;
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.activeElement?.blur());
  const top = await page.evaluate(() => document.querySelector("#get-started").getBoundingClientRect().top + scrollY);
  const end = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({ path: `${out}/ending-${w}x${h}.png`, fullPage: true, clip: { x: 0, y: top - 20, width: w, height: end - top + 20 } });
  await ctx.close();
}
writeFileSync(`${out}/ending.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
await browser.close();
