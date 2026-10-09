// The scripts a mode fetches: every JS request on load, and whether three.js or GSAP is among them.
// usage: node net.mjs <W>x<H> [--reduced] [--nowebgl] [--url u]
import { chromium } from "playwright-core";
const [size, ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const flag = (f) => rest.includes(f);
const url = rest.includes("--url") ? rest[rest.indexOf("--url") + 1] : "http://localhost:3100/lab/cinematic/";
const args = flag("--nowebgl") ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const page = await browser.newPage({ viewport: { width, height }, reducedMotion: flag("--reduced") ? "reduce" : "no-preference" });
const scripts = [];
page.on("request", (r) => {
  if (r.resourceType() === "script" || /\.js(\?|$)/.test(r.url())) scripts.push(r.url());
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(6000);
const mode = await page.evaluate(() => ({ kfilm: document.documentElement.dataset.kfilm, live: document.documentElement.dataset.kfilmLive !== undefined, marks: performance.getEntriesByType("mark").filter((m) => m.name.startsWith("kfilm")).map((m) => `${m.name} ${Math.round(m.startTime)}`) }));
// Chunk contents are the reliable test in development (chunk names are module paths there): ask for the source.
const heavy = [];
for (const s of scripts) {
  if (/three|gsap|ScrollTrigger/i.test(s)) heavy.push(s);
}
console.log(JSON.stringify({ size, reduced: flag("--reduced"), nowebgl: flag("--nowebgl"), mode, scripts: scripts.length, heavy, errors }, null, 1));
await browser.close();
