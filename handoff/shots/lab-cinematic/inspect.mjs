// Opens the film at a progress and runs an expression in the page (for layout questions).
// usage: node inspect.mjs <W>x<H> <p> "<js expression>" [--reduced] [--nowebgl] [--shot out.png] [--url u]
import { chromium } from "playwright-core";
const [size, pArg, expr, ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const opt = (name, dflt) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : dflt);
const args = rest.includes("--nowebgl") ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const mobile = width < 600;
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: mobile ? 3 : 1,
  isMobile: mobile,
  hasTouch: mobile,
  reducedMotion: rest.includes("--reduced") ? "reduce" : "no-preference",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`);
});
await page.goto(opt("--url", "http://localhost:3100/lab/cinematic/"), { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
await page.waitForSelector("[data-ready]", { timeout: 30000 }).catch(() => errors.push("never ready"));
await page.waitForTimeout(1500);
await page.evaluate((p) => {
  const track = document.querySelector("[data-film-track]");
  const top = track.getBoundingClientRect().top + window.scrollY;
  const span = Math.max(0, track.offsetHeight - window.innerHeight);
  window.scrollTo({ top: top + p * span, behavior: "instant" });
}, Number(pArg));
await page.waitForTimeout(Number(opt("--wait", 2200)));
const shot = opt("--shot", null);
if (shot) await page.screenshot({ path: shot });
const out = await page.evaluate((expr) => {
  // eslint-disable-next-line no-eval
  const v = (0, eval)(expr);
  return typeof v === "string" ? v : JSON.stringify(v, null, 1);
}, expr);
console.log(out);
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
