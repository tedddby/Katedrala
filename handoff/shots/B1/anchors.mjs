// Where the film's anchors land: a deep link to each (#film-start, #evidence, #impact, #trace) on a fresh load, in
// film and still modes, and "Explore Katedrala" clicked from the top. Reports the scroll position against the
// clock's anchor, the act and local time the film is at, the captions shown and what lies under the bar.
// usage: node anchors.mjs <W>x<H> [--reduced] [--shots dir]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const [size, ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const reduced = rest.includes("--reduced");
const shots = rest.includes("--shots") ? rest[rest.indexOf("--shots") + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const base = "http://localhost:3100/lab/cinematic/";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const mobile = width < 600;
const results = [];
const ids = ["film-start", "evidence", "impact", "trace"];
const ready = async (page) => {
  try {
    // The still layout draws a figure only within a viewport of the window: a deep link far below the hero leaves it
    // undrawn, and the page is ready once the controller runs.
    await page.waitForFunction(
      () => {
        const d = document.documentElement.dataset;
        return d.kfilm === "still" ? window.__kfilm?.figures?.length > 0 : d.kfilmLive !== undefined;
      },
      null,
      { timeout: 30000 },
    );
  } catch (e) {
    const s = await page.evaluate(() => ({ html: document.documentElement.outerHTML.slice(0, 300), kfilm: document.documentElement.dataset.kfilm, ready: document.documentElement.dataset.kfilmReady, y: scrollY, film: !!window.__kfilm, figs: window.__kfilm?.figures?.length }));
    console.error("not live", JSON.stringify(s));
    throw e;
  }
  await page.waitForTimeout(2500);
};
const state = (page, id) =>
  page.evaluate((id) => {
    const film = window.__kfilm;
    const track = document.querySelector("[data-film-track]");
    const top = track.getBoundingClientRect().top + scrollY;
    const anchor = document.getElementById(id);
    const index = ["film-start", "evidence", "impact", "trace"].indexOf(id);
    const nav = document.querySelector(".site-nav")?.getBoundingClientRect().bottom ?? 64;
    const shown = [...document.querySelectorAll("[data-caption][data-on]")].map((c) => {
      const r = c.getBoundingClientRect();
      return { id: c.dataset.caption, top: Math.round(r.top), clearOfBar: r.top >= nav };
    });
    const out = {
      id,
      mode: document.documentElement.dataset.kfilm,
      hash: location.hash,
      scrollY: Math.round(scrollY),
      anchorTop: Math.round(anchor.getBoundingClientRect().top),
      captions: shown,
    };
    if (film?.clock) {
      const expected = top + film.clock.anchorOf(index) * innerHeight;
      out.expectedY = Math.round(expected);
      out.offBy = Math.round(scrollY - expected);
      out.at = `${film.pos.id} ${film.pos.t.toFixed(3)}`;
    } else {
      // Still: the block after the anchor starts below the bar.
      const block = anchor.nextElementSibling;
      out.blockTop = block ? Math.round(block.getBoundingClientRect().top) : null;
      out.navBottom = Math.round(nav);
    }
    return out;
  }, id);

for (const id of ids) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: reduced ? "reduce" : "no-preference" });
  await page.goto(`${base}#${id}`, { waitUntil: "load" });
  await ready(page);
  results.push({ kind: "deep link", ...(await state(page, id)) });
  if (shots) await page.screenshot({ path: `${shots}/${reduced ? "still" : "film"}-${width}-${id}.png` });
  await page.close();
}
{
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: reduced ? "reduce" : "no-preference" });
  await page.goto(base, { waitUntil: "load" });
  await ready(page);
  const link = page.getByRole("link", { name: "Explore Katedrala" });
  if (mobile) await link.tap();
  else await link.click();
  const t0 = Date.now();
  const ys = [];
  for (let i = 0; i < 12; i++) {
    ys.push(await page.evaluate(() => Math.round(scrollY)));
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(1500);
  results.push({ kind: "Explore Katedrala", path: ys, ms: Date.now() - t0, ...(await state(page, "film-start")) });
  if (shots) await page.screenshot({ path: `${shots}/${reduced ? "still" : "film"}-${width}-explore.png` });
  await page.close();
}
console.log(JSON.stringify(results, null, 1));
await browser.close();
