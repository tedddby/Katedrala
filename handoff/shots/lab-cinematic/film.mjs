// Robust capture of the cinematic route at chosen progress values.
// usage: node film.mjs <outDir> <W>x<H> <p1,p2,...> [--wait ms] [--prefix name] [--reduced] [--nowebgl] [--settle ms]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const [outDir, size = "1440x900", list = "0", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const ps = list.split(",").map(Number);
const opt = (name, dflt) => { const i = rest.indexOf(name); return i < 0 ? dflt : rest[i + 1]; };
const wait = Number(opt("--wait", 2200));
const settle = Number(opt("--settle", 1500));
const prefix = opt("--prefix", `${width}`);
const reduced = rest.includes("--reduced");
const nowebgl = rest.includes("--nowebgl");
const url = opt("--url", "http://localhost:3100/lab/cinematic/");
mkdirSync(outDir, { recursive: true });
const args = nowebgl ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const mobile = width < 600;
const context = await browser.newContext({
  viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile,
  reducedMotion: reduced ? "reduce" : "no-preference",
});
const page = await context.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
try {
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  // Hide the Next dev overlay (other agents' compile errors would otherwise cover the capture).
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForSelector("canvas[data-ready]", { timeout: 30000 }).catch(() => errors.push("canvas never ready"));
  await page.waitForTimeout(settle);
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
  console.log("mode", await page.evaluate(() => document.documentElement.dataset.kfilm));
} catch (e) {
  console.log("FAILED", e.message);
}
const mine = errors.filter((e) => !/lab\/(drawing|physical)|HangingHero|TALL_SPEC/.test(e));
console.log(mine.length ? mine.join("\n") : "no console errors (from this route)");
await browser.close();
