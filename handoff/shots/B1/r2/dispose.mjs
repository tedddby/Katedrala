// Dispose on unmount: navigate client-side away from the film (Next's router) and check what the film left behind:
// attributes on <html>, the WebGL context, ScrollTrigger and its frame loop, requestAnimationFrame callbacks. Then
// navigate back and check the film runs again (one live context, the clock on).
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  const orig = window.requestAnimationFrame.bind(window);
  window.__rafN = 0;
  window.requestAnimationFrame = (cb) => orig((t) => { window.__rafN++; cb(t); });
  const get = HTMLCanvasElement.prototype.getContext;
  window.__gl = [];
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const c = get.call(this, type, attrs);
    if (/webgl/.test(type) && c && !window.__gl.includes(c)) window.__gl.push(c);
    return c;
  };
});
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
await page.waitForTimeout(3000);
const snap = () =>
  page.evaluate(async () => {
    const n0 = window.__rafN;
    await new Promise((r) => setTimeout(r, 2000));
    const st = window.__st;
    return {
      path: location.pathname,
      html: Object.keys(document.documentElement.dataset).filter((k) => k.startsWith("kfilm")),
      liveContexts: window.__gl.filter((c) => !c.isContextLost()).length,
      contextsMade: window.__gl.length,
      triggers: st ? st.getAll().length : null,
      rafPer2s: window.__rafN - n0,
      film: !!document.querySelector("[data-film-track]"),
      director: !!window.__kfilm,
    };
  });
await page.evaluate(() => { window.__st = window.__kfilm.scrollClock; });
const before = await snap();
await page.evaluate(() => window.next.router.push("/"));
await page.waitForFunction(() => location.pathname === "/" && !document.querySelector("[data-film-track]"), null, { timeout: 60000 });
await page.waitForTimeout(3000);
const away = await snap();
await page.evaluate(() => window.next.router.push("/lab/cinematic/"));
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
await page.waitForTimeout(3000);
await page.evaluate(() => { window.__st = window.__kfilm.scrollClock; });
const back = await snap();
// The clock is on again: the film follows a scroll.
await page.evaluate(() => { const tr = window.__kfilm.trigger; window.scrollTo({ top: tr.start + 0.25 * (tr.end - tr.start), behavior: "instant" }); });
await page.waitForTimeout(1500);
const follows = await page.evaluate(() => `${window.__kfilm.pos.id} ${window.__kfilm.pos.t.toFixed(3)}`);
console.log(JSON.stringify({ before, away, back, follows }, null, 1));
await browser.close();
