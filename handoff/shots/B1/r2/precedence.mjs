// Hover precedence: in an act with its own lighting (Act III's wave, Act II's dependency), a hovered file's trace wins;
// leaving gives the act's lighting back; a pinned trace wins across beats and acts until Escape.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
await page.waitForTimeout(2500);
const go = (index, t) => page.evaluate(([index, t]) => { const f = window.__kfilm; const tr = f.trigger; window.scrollTo({ top: tr.start + f.clock.progressOf(index, t) * (tr.end - tr.start), behavior: "instant" }); }, [index, t]);
const lit = () => page.evaluate(() => ({ key: window.__kfilm.litKey, pos: `${window.__kfilm.pos.id} ${window.__kfilm.pos.t.toFixed(3)}`, hover: window.__kfilm.hover, pinned: window.__kfilm.pinned, label: [...document.querySelectorAll("[data-film-labels] [data-label][data-on]")].map((l) => l.textContent.slice(0, 50)) }));
const filePoint = () => page.evaluate(() => {
  const f = window.__kfilm; const st = f.stage; const rect = document.querySelector("[data-film-stage]").getBoundingClientRect();
  const q = { x: 0, y: 0, depth: 0, visible: false };
  let best = -1, bd = Infinity;
  for (let v = 0; v < f.model.n; v++) {
    st.screenOf(v, q); if (!q.visible) continue;
    const hit = document.elementFromPoint(rect.left + q.x, rect.top + q.y);
    if (!hit || hit.closest("a, button, input, select, label, summary, [data-film-hero], [data-no-trace], [data-obstacle], pre")) continue;
    const d = Math.hypot(q.x - rect.width * 0.7, q.y - rect.height * 0.5);
    if (d < bd) { bd = d; best = v; }
  }
  st.screenOf(best, q);
  return { v: best, path: f.model.paths[best], x: rect.left + q.x, y: rect.top + q.y };
});
const out = [];
await go(2, 0.6); await page.waitForTimeout(1500);
out.push({ step: "Act III wave, no input", ...(await lit()) });
const pt = await filePoint();
await page.mouse.move(pt.x, pt.y, { steps: 5 }); await page.waitForTimeout(700);
out.push({ step: `hover ${pt.path}`, ...(await lit()) });
await page.mouse.move(5, 450, { steps: 3 }); await page.waitForTimeout(700);
out.push({ step: "pointer left the file", ...(await lit()) });
await page.mouse.move(pt.x, pt.y, { steps: 5 }); await page.waitForTimeout(500);
await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(500);
await page.mouse.move(5, 450, { steps: 3 }); await page.waitForTimeout(500);
out.push({ step: "pinned by click, pointer away", ...(await lit()) });
await go(1, 0.75); await page.waitForTimeout(1500);
out.push({ step: "pinned, scrolled to Act II E4", ...(await lit()) });
await page.keyboard.press("Escape"); await page.waitForTimeout(600);
out.push({ step: "Escape", ...(await lit()), status: await page.evaluate(() => document.querySelector("[data-film-status]").textContent) });
for (const o of out) console.log(JSON.stringify(o));
await browser.close();
