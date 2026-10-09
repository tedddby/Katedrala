// Every caption in its window: on screen, clear of the bar, inside the frame; the hero actions without scroll; the
// crown hold captured. usage: node captions.mjs <W>x<H> [--touch]
import { chromium } from "playwright-core";
const [size = "1280x720", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const touch = rest.includes("--touch") || height < 500;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: touch ? 3 : 1, isMobile: touch, hasTouch: touch });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
await page.waitForTimeout(3500);
const hero = await page.evaluate(() => {
  const nav = document.querySelector(".site-nav").getBoundingClientRect();
  const acts = [...document.querySelectorAll("[data-film-hero] a")].map((a) => { const r = a.getBoundingClientRect(); return { name: a.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; });
  const h1 = document.querySelector("[data-film-hero] h1").getBoundingClientRect();
  return { navBottom: Math.round(nav.bottom), h1Top: Math.round(h1.top), actions: acts, innerHeight };
});
await page.screenshot({ path: `cap/cap-${size}-hero.png` });
const caps = await page.evaluate(() => [...document.querySelectorAll("[data-caption]")].map((c) => ({ id: c.dataset.caption, act: c.dataset.act, from: +c.dataset.from, to: +c.dataset.to })));
const out = [];
for (const c of caps) {
  const index = ["hang", "evidence", "change", "trace"].indexOf(c.act);
  await page.evaluate(([index, t]) => {
    const film = window.__kfilm;
    const tr = film.trigger;
    window.scrollTo({ top: tr.start + film.clock.progressOf(index, t) * (tr.end - tr.start), behavior: "instant" });
  }, [index, (c.from + c.to) / 2]);
  await page.waitForTimeout(1600);
  const m = await page.evaluate((id) => {
    const el = document.querySelector(`[data-caption="${id}"]`);
    const words = [...el.querySelectorAll("[data-obstacle-box]")];
    const boxes = (words.length ? words : [el]).map((w) => w.getBoundingClientRect());
    const top = Math.min(...boxes.map((b) => b.top));
    const bottom = Math.max(...boxes.map((b) => b.bottom));
    const nav = document.querySelector(".site-nav").getBoundingClientRect();
    const tb = document.querySelector("[data-film-titleblock]").getBoundingClientRect();
    const right = Math.max(...boxes.map((b) => b.right));
    const left = Math.min(...boxes.map((b) => b.left));
    const overlapTB = !(right < tb.left || left > tb.right || bottom < tb.top || top > tb.bottom);
    return { on: el.hasAttribute("data-on"), top: Math.round(top), bottom: Math.round(bottom), clearOfBar: top >= nav.bottom, inFrame: bottom <= innerHeight, overlapsTitleBlock: overlapTB };
  }, c.id);
  out.push({ id: c.id, ...m });
  if (c.id === "crown" || c.id === "land" || /crown/.test(c.id)) await page.screenshot({ path: `cap/cap-${size}-${c.id}.png` });
}
console.log(JSON.stringify({ size, hero, captions: out }, null, 0).replace(/\},\{/g, "},\n{"));
await browser.close();
