// Final captures of the cinematic film. Scrolls through the film like a visitor (progressively, so the physics is
// in the state a real scroll leaves it), waits at each point, and captures the viewport.
// usage:
//   node final.mjs film <outDir> <W>x<H> <prefix> <p1,p2,...>
//   node final.mjs hover <outDir> <W>x<H> <name> <p> <file> [--tap]
//   node final.mjs still <outDir> <W>x<H> <name> [--reduced] [--nowebgl] [--full]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const [kind, outDir, size, name, ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
mkdirSync(outDir, { recursive: true });
const flag = (f) => rest.includes(f);
const args = flag("--nowebgl") ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const mobile = width < 600;
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: mobile ? 3 : 1,
  isMobile: mobile,
  hasTouch: mobile,
  reducedMotion: flag("--reduced") ? "reduce" : "no-preference",
});
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`);
});
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
await page.waitForSelector("canvas[data-ready]", { timeout: 30000 }).catch(() => errors.push("never ready"));
await page.waitForTimeout(2600);

const geo = () =>
  page.evaluate(() => {
    const track = document.querySelector("[data-film-track]");
    return { top: track.getBoundingClientRect().top + scrollY, span: Math.max(1, track.offsetHeight - innerHeight) };
  });

// Scrolls to progress p at about `speed` px/s, in the page, then resolves.
const scrollTo = async (p, speed = 1600) => {
  const { top, span } = await geo();
  await page.evaluate(
    ({ target, speed }) =>
      new Promise((res) => {
        const y0 = scrollY;
        const dist = target - y0;
        const dur = (Math.abs(dist) / speed) * 1000;
        const t0 = performance.now();
        const step = () => {
          const k = dur === 0 ? 1 : Math.min(1, (performance.now() - t0) / dur);
          window.scrollTo({ top: y0 + dist * k, behavior: "instant" });
          if (k < 1) requestAnimationFrame(step);
          else res();
        };
        requestAnimationFrame(step);
      }),
    { target: top + p * span, speed },
  );
};

const tag = (p) => `p${String(Math.round(p * 1000)).padStart(4, "0")}`;

if (kind === "film") {
  const ps = rest[0].split(",").map(Number);
  for (const p of ps) {
    await scrollTo(p);
    await page.waitForTimeout(1800);
    const file = `${outDir}/${name}-${tag(p)}.png`;
    await page.screenshot({ path: file });
    console.log("wrote", file);
  }
} else if (kind === "hover") {
  const p = Number(rest[0]);
  const target = rest[1];
  await scrollTo(p);
  await page.waitForTimeout(2200);
  const at = await page.evaluate((file) => {
    const film = window.__kfilm;
    const v = film.model.paths.indexOf(file);
    const stage = document.querySelector("[data-film-stage]").getBoundingClientRect();
    let pt = null;
    if (film.stage) {
      const q = { x: 0, y: 0, depth: 0, visible: false };
      film.stage.screenOf(v, q);
      pt = q.visible ? q : null;
    } else if (film.fallback) pt = film.fallback.screenOf(v);
    return pt === null ? null : { x: stage.left + pt.x, y: stage.top + pt.y };
  }, target);
  if (at === null) errors.push(`not on screen: ${target}`);
  else {
    if (flag("--tap")) await page.touchscreen.tap(at.x, at.y);
    else await page.mouse.move(at.x, at.y, { steps: 8 });
    await page.waitForTimeout(900);
    const file = `${outDir}/${name}.png`;
    await page.screenshot({ path: file });
    const status = await page.evaluate(() => document.querySelector("[data-film-status]").textContent);
    console.log("wrote", file, "status:", status);
  }
} else if (kind === "handoff") {
  // The end of the film and what follows it: past the track by a fraction of the window.
  const past = Number(rest[0] ?? 0.45);
  await scrollTo(1);
  await page.waitForTimeout(1500);
  await page.evaluate((past) => window.scrollBy({ top: innerHeight * past, behavior: "instant" }), past);
  await page.waitForTimeout(900);
  const file = `${outDir}/${name}.png`;
  await page.screenshot({ path: file });
  const under = await page.evaluate(() => document.documentElement.dataset.kfilmUnder !== undefined);
  console.log("wrote", file, "nav clear:", under);
} else if (kind === "still") {
  const file = `${outDir}/${name}.png`;
  await page.screenshot({ path: file, fullPage: flag("--full") });
  const state = await page.evaluate(() => ({
    mode: document.documentElement.dataset.kfilm,
    note: !document.querySelector("[data-film-fallback]").hidden,
  }));
  console.log("wrote", file, JSON.stringify(state));
}
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
