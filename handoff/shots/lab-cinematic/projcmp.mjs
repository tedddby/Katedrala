import { chromium } from "playwright-core";
for (const nowebgl of [false, true]) {
  const args = nowebgl ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : [];
  const browser = await chromium.launch({ channel: "msedge", headless: true, args });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
  await page.waitForSelector("[data-ready]", { timeout: 30000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const film = window.__kfilm;
    const m = film.model;
    const ids = [m.crown, m.heaviest[0], m.heaviest[1], m.spine[0]];
    const stage = document.querySelector("[data-film-stage]").getBoundingClientRect();
    const out = ids.map((v) => {
      if (film.stage) { const q = { x: 0, y: 0, depth: 0, visible: false }; film.stage.screenOf(v, q); return [Math.round(q.x), Math.round(q.y)]; }
      const q = film.fallback.screenOf(v); return [Math.round(q.x), Math.round(q.y)];
    });
    const canvas = document.querySelector("[data-film-stage] canvas");
    return { mode: document.documentElement.dataset.kfilm, stage: [stage.width, stage.height], canvas: [canvas.width, canvas.height, canvas.clientWidth, canvas.clientHeight], out };
  });
  console.log(nowebgl ? "2d   " : "webgl", JSON.stringify(r));
  await browser.close();
}
