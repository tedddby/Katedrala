// Hero geometry: lede lines, widths, the left edges of wordmark / h1 / lede, at several widths.
import { chromium } from "playwright-core";
const sizes = (process.argv[2] ?? "1440x900,1920x1080,1280x720,1024x768,768x1024,390x844,844x390").split(",");
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const s of sizes) {
  const [width, height] = s.split("x").map(Number);
  const mobile = width < 600 || (height < 500 && width < 900);
  const page = await browser.newPage({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, reducedMotion: process.argv.includes("--reduced") ? "reduce" : "no-preference" });
  await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const lede = document.querySelector("[data-film-hero] p");
    const range = document.createRange();
    range.selectNodeContents(lede);
    const rects = [...range.getClientRects()];
    const lines = new Set(rects.map((r) => Math.round(r.top))).size;
    const h1 = document.querySelector("h1 span[aria-hidden]");
    const h1r = h1.getBoundingClientRect();
    const h1rects = [...h1.getClientRects()];
    const wm = document.querySelector(".site-nav a")?.getBoundingClientRect();
    const hero = document.querySelector("[data-film-hero]").getBoundingClientRect();
    const actions = [...document.querySelectorAll("[data-film-hero] a")].map((a) => { const r = a.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; });
    const tb = document.querySelector("[data-film-titleblock]").getBoundingClientRect();
    const fs = getComputedStyle(lede).fontSize;
    return {
      lede: { lines, left: Math.round(lede.getBoundingClientRect().left), width: Math.round(lede.getBoundingClientRect().width), fs },
      h1: { left: Math.round(h1r.left), top: Math.round(h1r.top), bottom: Math.round(h1r.bottom), lines: new Set([...h1.querySelectorAll("span")].map((x) => Math.round(x.getBoundingClientRect().top))).size, fs: getComputedStyle(h1).fontSize },
      wordmark: wm ? Math.round(wm.left) : null,
      heroBottom: Math.round(hero.bottom),
      actions,
      titleblock: [Math.round(tb.left), Math.round(tb.top), Math.round(tb.right), Math.round(tb.bottom)],
      vh: innerHeight,
      overflowX: document.documentElement.scrollWidth > innerWidth,
    };
  });
  console.log(s, JSON.stringify(info));
  await page.close();
}
await browser.close();
