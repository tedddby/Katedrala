// Captures of the promoted film on the preview route, at Act I's local times (the finisher's capture points), the
// way final.mjs captured the prototype: scrolls progressively (so the physics is in the state a real scroll leaves
// it), waits at each point, captures the viewport.
// usage:
//   node film.mjs film <outDir> <W>x<H> <prefix> <t1,t2,...> [--act n]     (t: local time of act n, default 0)
//   node film.mjs hover <outDir> <W>x<H> <name> <t> <file> [--tap] [--act n]
//   node film.mjs still <outDir> <W>x<H> <name> [--reduced] [--nowebgl] [--full]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const [kind, outDir, size, name, ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
mkdirSync(outDir, { recursive: true });
const flag = (f) => rest.includes(f);
const opt = (f, d) => (rest.includes(f) ? rest[rest.indexOf(f) + 1] : d);
const act = Number(opt("--act", 0));
const url = opt("--url", "http://localhost:3100/lab/cinematic/");
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
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`console ${m.type()}: ${m.text().slice(0, 300)}`);
});
await page.goto(url, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
// Act I parity only: Acts II, III and the landing are their builder's work in progress (their words over the frame
// and their blocks are hidden here, so the comparison is Act I against the finisher's film).
if (flag("--hide-later-acts"))
  await page.addStyleTag({ content: "[data-act-layer],[data-act-slot]:not([data-act-slot=hang]){visibility:hidden!important}" });
await page.waitForSelector("canvas[data-ready]", { timeout: 30000 }).catch(() => errors.push("never ready"));
await page.waitForTimeout(2600);

const geo = (t) =>
  page.evaluate(
    ({ t, act }) => {
      const film = window.__kfilm;
      const track = document.querySelector("[data-film-track]");
      const top = track.getBoundingClientRect().top + scrollY;
      const span = Math.max(1, track.offsetHeight - innerHeight);
      const P = film.clock ? film.clock.progressOf(act, t) : t;
      return { top, span, P };
    },
    { t, act },
  );

// Scrolls to an act's local time at about `speed` px/s, in the page, then resolves.
const scrollTo = async (t, speed = 1600) => {
  const { top, span, P } = await geo(t);
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
    { target: top + P * span, speed },
  );
};

const tag = (t) => `p${String(Math.round(t * 1000)).padStart(4, "0")}`;

if (kind === "film") {
  const ts = rest[0].split(",").map(Number);
  for (const t of ts) {
    await scrollTo(t);
    await page.waitForTimeout(1800);
    const file = `${outDir}/${name}-${tag(t)}.png`;
    await page.screenshot({ path: file });
    const state = await page.evaluate(() => {
      const f = window.__kfilm;
      return {
        P: f?.p?.toFixed?.(4),
        act: f?.pos ? `${f.pos.id} ${f.pos.t.toFixed(3)}` : null,
        captions: [...document.querySelectorAll("[data-caption][data-on]")].map((c) => c.dataset.caption),
        under: document.documentElement.dataset.kfilmUnder !== undefined,
      };
    });
    console.log("wrote", file, JSON.stringify(state));
  }
} else if (kind === "hover") {
  const t = Number(rest[0]);
  const target = rest[1];
  await scrollTo(t);
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
