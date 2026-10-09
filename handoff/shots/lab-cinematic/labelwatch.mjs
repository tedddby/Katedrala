// Watches one annotation over time at a given progress: the node's screen position and whether its label is on.
// usage: node labelwatch.mjs <W>x<H> <p> [seconds]
import { chromium } from "playwright-core";
const [size = "390x844", pArg = "0.45", secondsArg = "4"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const mobile = width < 600;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
await page.waitForTimeout(1200);
await page.evaluate((p) => {
  const track = document.querySelector("[data-film-track]");
  const top = track.getBoundingClientRect().top + window.scrollY;
  const span = Math.max(0, track.offsetHeight - window.innerHeight);
  window.scrollTo({ top: top + p * span, behavior: "instant" });
}, Number(pArg));
const out = await page.evaluate(async (seconds) => {
  const film = window.__kfilm;
  const rows = [];
  const t0 = performance.now();
  await new Promise((res) => {
    const f = () => {
      const pt = { x: 0, y: 0, depth: 0, visible: false };
      const a = film.annotations.find((x) => x.on || (x.node === film.model.crown && film.p >= x.from && film.p <= x.to));
      if (a && film.stage) film.stage.screenOf(a.node, pt);
      rows.push([Math.round(performance.now() - t0), +film.p.toFixed(4), a ? a.on : null, Math.round(pt.x), Math.round(pt.y), pt.visible, a ? a.slot : null]);
      if (performance.now() - t0 < seconds * 1000) requestAnimationFrame(f);
      else res();
    };
    requestAnimationFrame(f);
  });
  let flips = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i][2] !== rows[i - 1][2]) flips++;
  let slotChanges = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i][6] !== rows[i - 1][6]) slotChanges++;
  return { frames: rows.length, flips, slotChanges, sample: rows.filter((_, i) => i % 25 === 0) };
}, Number(secondsArg));
console.log(JSON.stringify(out));
await browser.close();
