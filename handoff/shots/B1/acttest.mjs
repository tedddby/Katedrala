// The act interface end to end with a temporary test act (Act II): film mode (camera continuity across the
// boundary, the act's lighting, labels, captions in its layer, overlay updates, emphasis) and still mode (its
// figure drawn in 2D through its still camera, the pixel budget).
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const out = "out/acttest";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = {};
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
  await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  const goto = async (index, t) => {
    await page.evaluate(
      ({ index, t }) => {
        const film = window.__kfilm;
        const P = film.clock.progressOf(index, t);
        const tr = film.trigger;
        window.scrollTo({ top: tr.start + P * (tr.end - tr.start), behavior: "instant" });
      },
      { index, t },
    );
    await page.waitForTimeout(2200);
  };
  // Camera continuity: the camera just before and just after the boundary.
  const cams = await page.evaluate(() => {
    const film = window.__kfilm;
    const P = film.clock.progressOf(1, 0);
    const a = film.cameraAt(P - 1e-6);
    const ea = [...a.eye];
    const b = film.cameraAt(P + 1e-6);
    return { before: ea, after: [...b.eye], d: Math.hypot(ea[0] - b.eye[0], ea[1] - b.eye[1], ea[2] - b.eye[2]) };
  });
  results.cameraJumpAtBoundary = cams.d;
  await goto(1, 0.6);
  results.film = await page.evaluate(() => ({
    at: `${window.__kfilm.pos.id} ${window.__kfilm.pos.t.toFixed(3)}`,
    caption: document.querySelector("[data-caption='e-test']")?.hasAttribute("data-on"),
    layerActive: document.querySelector("[data-act-layer='evidence']")?.hasAttribute("data-active"),
    slotActive: document.querySelector("[data-act-slot='evidence']")?.hasAttribute("data-active"),
    labelsOn: document.querySelectorAll("[data-film-labels] [data-label][data-on]").length,
    overlay: window.__actTest,
    marks: performance.getEntriesByType("mark").map((m) => m.name).filter((n) => n.startsWith("kfilm:act")),
  }));
  await page.screenshot({ path: `${out}/film-evidence-0.6.png` });
  await goto(1, 0.95);
  results.emphasis = await page.evaluate(() => window.__kfilm.emphasis);
  await page.screenshot({ path: `${out}/film-evidence-0.95.png` });
  results.filmErrors = errors;
  await page.close();
}
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  const pixels = () =>
    page.evaluate(() =>
      window.__kfilm.figures.map((f) => ({ id: f.act.id, near: f.near, drawn: f.fallback?.drawn ?? false, w: f.canvas.width })),
    );
  results.stillTop = await pixels();
  await page.evaluate(() => document.querySelector("[data-still-act='evidence']").scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForTimeout(1500);
  results.stillAtFigure = await pixels();
  results.stillOverlay = await page.evaluate(() => window.__actTest);
  const fig = await page.$("[data-still-act='evidence']");
  await fig.screenshot({ path: `${out}/still-evidence.png` });
  // Hover a file on the figure: its trace wins over the act's lighting.
  const pt = await page.evaluate(() => {
    const f = window.__kfilm.figures.find((g) => g.act.id === "evidence");
    const v = f.act.id && window.__kfilm.model.paths.indexOf("src/analysis/cache-key.ts");
    const p = f.fallback.screenOf(v);
    const r = f.el.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.mouse.move(pt.x, pt.y, { steps: 5 });
  await page.waitForTimeout(500);
  await fig.screenshot({ path: `${out}/still-evidence-hover.png` });
  results.stillHover = await page.evaluate(() => window.__kfilm.figures.find((g) => g.act.id === "evidence").hover);
  results.stillErrors = errors;
  await page.close();
}
console.log(JSON.stringify(results, null, 1));
await browser.close();
