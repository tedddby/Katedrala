// Failure paths: a script chunk that cannot load (GSAP, or three.js and the stage) leaves the 2D still drawing, with
// no "Drawn without WebGL" note (WebGL is not the reason), and no page error.
import { chromium } from "playwright-core";
const [what = "gsap"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
const pattern = what === "gsap" ? /gsap/i : what === "three" ? /three|stage_ts|components_stage_stage/i : /codeverse-graph\.json/;
let blocked = 0;
await page.route("**/*", (route) => {
  const url = route.request().url();
  if (pattern.test(url)) { blocked++; return route.abort(); }
  return route.continue();
});
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForTimeout(6000);
const st = await page.evaluate(() => ({
  mode: document.documentElement.dataset.kfilm,
  live: document.documentElement.dataset.kfilmLive !== undefined,
  note: !document.querySelector("[data-film-fallback]").hidden,
  canvasReady: document.querySelector("[data-film-canvas]")?.hasAttribute("data-ready"),
  still: !!window.__kfilm?.still || window.__kfilm?.constructor?.name,
}));
console.log(JSON.stringify({ what, blocked, ...st, errors }));
await page.screenshot({ path: `cap/fail-${what}.png` });
await browser.close();
