// Captures the cinematic lab route at chosen film progress values.
// usage: node shoot.mjs <outDir> <width>x<height> p1,p2,... [--wait ms] [--args swiftshader] [--prefix name] [--reduced]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const [outDir, size = "1440x900", list = "0", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const ps = list.split(",").map(Number);
const opt = (name, dflt) => {
  const i = rest.indexOf(name);
  return i < 0 ? dflt : rest[i + 1];
};
const wait = Number(opt("--wait", 2500));
const prefix = opt("--prefix", `${width}`);
const reduced = rest.includes("--reduced");
const url = opt("--url", "http://localhost:3100/lab/cinematic/");
mkdirSync(outDir, { recursive: true });
const args = rest.includes("--swiftshader") ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: width < 600 ? 3 : 1,
  isMobile: width < 600,
  hasTouch: width < 600,
  reducedMotion: reduced ? "reduce" : "no-preference",
});
const page = await context.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: "load" });
await page.waitForSelector("canvas[data-ready]", { timeout: 30000 }).catch(() => errors.push("canvas never ready"));
await page.waitForTimeout(1500);
for (const p of ps) {
  await page.evaluate((p) => {
    const track = document.querySelector("[data-film-track]");
    const top = track.getBoundingClientRect().top + window.scrollY;
    const span = track.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + p * span, behavior: "instant" });
  }, p);
  await page.waitForTimeout(wait);
  const name = `${outDir}/${prefix}-p${String(Math.round(p * 1000)).padStart(4, "0")}.png`;
  await page.screenshot({ path: name });
  console.log("wrote", name);
}
const mode = await page.evaluate(() => document.documentElement.dataset.kfilm);
console.log("mode", mode);
console.log(errors.length ? errors.join("\n") : "no console errors");
await browser.close();
