// Still layout: tracing with the mouse (hover previews, click pins, Escape clears) and by tap, on every act figure
// present (Act I's in the hero frame; the others where their blocks put them), in reduced motion or without WebGL.
// usage: node stilltrace.mjs <W>x<H> <reduced|nowebgl>
import { chromium } from "playwright-core";
const [size = "1440x900", kind = "reduced"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const mobile = width < 600;
const args = kind === "nowebgl" ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: kind === "reduced" ? "reduce" : "no-preference" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.figures?.length > 0 && document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const acts = await page.evaluate(() => window.__kfilm.figures.map((f) => f.act.id));
const out = { size, kind, mode: await page.evaluate(() => document.documentElement.dataset.kfilm), acts, figures: {} };
for (const act of acts) {
  await page.evaluate((act) => {
    const f = window.__kfilm.figures.find((g) => g.act.id === act);
    if (act !== "hang") f.el.scrollIntoView({ block: "center", behavior: "instant" });
    else window.scrollTo({ top: 0, behavior: "instant" });
  }, act);
  await page.waitForTimeout(1200);
  // A visible file near the middle of the figure's visible part, clear of the words on it.
  const pt = await page.evaluate((act) => {
    const film = window.__kfilm;
    const f = film.figures.find((g) => g.act.id === act);
    const r = f.el.getBoundingClientRect();
    const cy = (Math.max(80, r.top) + Math.min(innerHeight, r.bottom)) / 2 - r.top;
    const cx = r.width * (r.width > 700 ? 0.68 : 0.5);
    let best = -1, bd = Infinity;
    for (let v = 0; v < film.model.n; v++) {
      const q = f.fallback?.screenOf(v);
      if (!q || !q.visible) continue;
      const hit = document.elementFromPoint(r.left + q.x, r.top + q.y);
      if (!f.el.contains(hit) || hit.closest("a, button, [data-film-hero], [data-no-trace]")) continue;
      const d = Math.hypot(q.x - cx, q.y - cy);
      if (d < bd) { bd = d; best = v; }
    }
    const q = f.fallback.screenOf(best);
    return { v: best, path: film.model.paths[best], x: r.left + q.x, y: r.top + q.y, drawn: f.fallback.drawn };
  }, act);
  const read = () => page.evaluate((act) => {
    const f = window.__kfilm.figures.find((g) => g.act.id === act);
    return { hover: f.hover, pinned: f.pinned, status: document.querySelector("[data-film-status]")?.textContent ?? null, labels: [...f.el.querySelectorAll("[data-label][data-on]")].map((l) => l.textContent.slice(0, 90)) };
  }, act);
  const r = { pt };
  if (mobile) {
    await page.touchscreen.tap(pt.x, pt.y);
    await page.waitForTimeout(500);
    r.afterTap = await read();
    await page.touchscreen.tap(pt.x, pt.y);
    await page.waitForTimeout(500);
    r.afterSecondTap = await read();
  } else {
    await page.mouse.move(pt.x, pt.y, { steps: 6 });
    await page.waitForTimeout(500);
    r.hover = await read();
    await page.screenshot({ path: `cap/stilltrace-${kind}-${size}-${act}.png` });
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(400);
    r.afterClick = await read();
    await page.mouse.move(5, height - 5);
    await page.waitForTimeout(300);
    r.pinnedAfterLeave = await read();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    r.afterEscape = await read();
  }
  out.figures[act] = r;
}
console.log(JSON.stringify(out, null, 1));
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
