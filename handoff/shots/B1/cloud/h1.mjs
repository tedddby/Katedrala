import { chromium } from "playwright-core";
const reduced = process.argv.includes("--reduced");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const h1 = document.querySelector("h1");
  const r = h1.getBoundingClientRect();
  const cs = getComputedStyle(h1);
  const w = h1.querySelector("span[aria-hidden] span");
  const ws = getComputedStyle(w);
  const hero = document.querySelector("[data-film-hero]");
  const hs = getComputedStyle(hero);
  return {
    h1: { rect: [r.x, r.y, r.width, r.height].map(Math.round), color: cs.color, opacity: cs.opacity, visibility: cs.visibility, display: cs.display, fontSize: cs.fontSize },
    word: { opacity: ws.opacity, transform: ws.transform, animation: ws.animationName, dur: ws.animationDuration, display: ws.display, rect: (() => { const q = w.getBoundingClientRect(); return [q.x, q.y, q.width, q.height].map(Math.round); })() },
    hero: { attrs: [...hero.attributes].map((a) => a.name).join(","), opacity: hs.opacity, transform: hs.transform, z: hs.zIndex, rect: (() => { const q = hero.getBoundingClientRect(); return [q.x, q.y, q.width, q.height].map(Math.round); })() },
    topEl: (() => { const e = document.elementFromPoint(150, 280); return e ? e.tagName + "." + e.className : null; })(),
    mode: document.documentElement.dataset.kfilm,
  };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: "cap/h1-" + (reduced ? "reduced" : "film") + ".png" });
await browser.close();
