// Which labels are on at a given Act I local t (and where), to debug the plan beat's folder names.
// usage: node labels.mjs [W]x[H] t
import { chromium } from "playwright-core";
const [size = "1440x900", tArg = "0.08"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const mobile = width < 600;
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 30000 });
await page.waitForTimeout(2500);
const t = Number(tArg);
await page.evaluate(async (t) => {
  const film = window.__kfilm;
  const track = document.querySelector("[data-film-track]");
  const top = track.getBoundingClientRect().top + scrollY;
  const span = track.offsetHeight - innerHeight;
  const P = film.clock.progressOf(0, t);
  for (let k = 1; k <= 30; k++) {
    window.scrollTo({ top: top + (P * span * k) / 30, behavior: "instant" });
    await new Promise((r) => requestAnimationFrame(r));
  }
}, t);
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const film = window.__kfilm;
  const labels = [...document.querySelectorAll("[data-film-labels] [data-label]")].map((el) => ({
    on: el.hasAttribute("data-on"),
    micro: el.hasAttribute("data-micro"),
    text: el.textContent,
    tf: el.style.transform,
  }));
  const pts = film.actLabels.map((a) => {
    const q = { x: 0, y: 0, depth: 0, visible: false };
    if (a.kind === 2) film.stage.screenOfWorld(a.x, a.y, a.z, q);
    else if (a.kind === 1) film.stage.screenOf(a.v, q);
    return { kind: a.kind, text: a.label.code.textContent, x: Math.round(q.x), y: Math.round(q.y), vis: q.visible, behind: film.labels.behindWords(q.x, q.y) };
  });
  return { pos: `${film.pos.id} ${film.pos.t.toFixed(3)}`, obstacles: film.obstacles.map((b) => [b.l, b.t, b.r, b.b].map(Math.round)), labels: labels.filter((l) => l.micro || l.on), pts };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: `cap/labels-${size}-${t}.png` });
await browser.close();
