// Still mode: hover and tap on an act's figure (and on the hero frame) trace a file.
import { chromium } from "playwright-core";
const [size = "1440x900"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const mobile = width < 600;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForTimeout(3000);
const pointOf = (act, file) => page.evaluate(({ act, file }) => {
  const f = window.__kfilm.figures.find((g) => g.act.id === act);
  const r = f.el.getBoundingClientRect();
  let v = window.__kfilm.model.paths.indexOf(file);
  let p = f.fallback.screenOf(v);
  if (r.top + p.y > innerHeight - 10 || r.top + p.y < 70) {
    // Off the window: take the file nearest the middle of the visible part of the figure.
    const cy = (Math.max(70, r.top) + Math.min(innerHeight, r.bottom)) / 2 - r.top;
    let best = -1, bd = Infinity;
    for (let u = 0; u < window.__kfilm.model.n; u++) { const q = f.fallback.screenOf(u); if (!q.visible) continue; const d = Math.hypot(q.x - r.width * 0.6, q.y - cy); if (d < bd) { bd = d; best = u; } }
    v = best; p = f.fallback.screenOf(v);
  }
  const x = r.left + p.x, y = r.top + p.y;
  const top = document.elementFromPoint(x, y);
  return { x, y, v, visible: p.visible, top: top ? `${top.tagName}.${top.className}`.slice(0, 80) : null, inFig: f.el.contains(top) };
}, { act, file });
const out = {};
for (const [act, file] of [["hang", "src/graph/model/types.ts"], ["evidence", "src/analysis/cache-key.ts"]]) {
  if (act === "evidence") {
    await page.evaluate(() => document.querySelector("[data-still-act='evidence']").scrollIntoView({ block: "center", behavior: "instant" }));
    await page.waitForTimeout(1200);
  }
  const pt = await pointOf(act, file);
  if (mobile) await page.touchscreen.tap(pt.x, pt.y);
  else await page.mouse.move(pt.x, pt.y, { steps: 6 });
  await page.waitForTimeout(500);
  const st = await page.evaluate((act) => {
    const f = window.__kfilm.figures.find((g) => g.act.id === act);
    return { hover: f.hover, pinned: f.pinned, status: document.querySelector("[data-film-status]").textContent, labels: [...f.el.querySelectorAll("[data-label][data-on]")].map((l) => l.textContent) };
  }, act);
  out[act] = { pt, ...st };
  if (!mobile) {
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(400);
    out[act].afterClick = await page.evaluate((act) => { const f = window.__kfilm.figures.find((g) => g.act.id === act); return { pinned: f.pinned, status: document.querySelector("[data-film-status]").textContent }; }, act);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    out[act].afterEscape = await page.evaluate((act) => window.__kfilm.figures.find((g) => g.act.id === act).pinned, act);
  }
  await page.screenshot({ path: `cap/stillhover-${size}-${act}.png` });
}
console.log(JSON.stringify(out, null, 1));
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
