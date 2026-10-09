// The scripts each mode fetches, checked by content (dev chunk names are module paths): three.js (WebGLRenderer),
// GSAP (ScrollTrigger / GreenSock), the WebGL stage (class Stage with HangingSim), the director, still.ts.
// usage: node net.mjs <W>x<H> [--reduced] [--nowebgl] [--url u]
import { chromium } from "playwright-core";
const [size, ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const flag = (f) => rest.includes(f);
const url = rest.includes("--url") ? rest[rest.indexOf("--url") + 1] : "http://localhost:3100/lab/cinematic/";
const args = flag("--nowebgl") ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const mobile = width < 600;
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: flag("--reduced") ? "reduce" : "no-preference" });
const scripts = new Map();
page.on("response", async (r) => {
  const u = r.url();
  if (r.request().resourceType() !== "script" && !/\.js(\?|$)/.test(u)) return;
  try { scripts.set(u, await r.text()); } catch { scripts.set(u, ""); }
});
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(7000);
const mode = await page.evaluate(() => ({ kfilm: document.documentElement.dataset.kfilm, live: document.documentElement.dataset.kfilmLive !== undefined, note: !document.querySelector("[data-film-fallback]")?.hidden, marks: performance.getEntriesByType("mark").filter((m) => m.name.startsWith("kfilm")).map((m) => `${m.name} ${Math.round(m.startTime)}`) }));
const found = { three: [], gsap: [], stage: [], director: [], still: [] };
for (const [u, src] of scripts) {
  const name = u.replace(/^https?:\/\/[^/]+/, "");
  if (/WebGLRenderer|REVISION\s*=\s*["']\d+/.test(src)) found.three.push(name);
  if (/GreenSock|ScrollTrigger\.version|_rafBugFix/.test(src)) found.gsap.push(name);
  if (/class HangingSim|new HangingSim\(/.test(src)) found.stage.push(name);
  if (/class Director\b/.test(src)) found.director.push(name);
  if (/class StillFilm\b/.test(src)) found.still.push(name);
}
console.log(JSON.stringify({ size, reduced: flag("--reduced"), nowebgl: flag("--nowebgl"), mode, scripts: scripts.size, found }, null, 1));
await browser.close();
