// Captures the preview route at given (act index, local t) points in film or still mode.
// Usage: node r2/cap.mjs <outdir> <w>x<h> <mode film|still|nowebgl> <act:t> [<act:t> ...]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const [out, size, mode, ...points] = process.argv.slice(2);
const [w, h] = size.split("x").map(Number);
mkdirSync(out, { recursive: true });
const args = mode === "nowebgl" ? ["--disable-webgl", "--disable-3d-apis"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const mobile = w < 600;
const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, reducedMotion: mode === "still" ? "reduce" : "no-preference" });
const logs = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`${m.type()}: ${m.text()}`); });
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(process.env.URL ?? "http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(2500);
console.log("mode", await page.evaluate(() => document.documentElement.dataset.kfilm));
for (const pt of points) {
  if (pt.startsWith("#")) {
    await page.evaluate((id) => document.getElementById(id.slice(1))?.scrollIntoView(), pt);
  } else {
    const [act, t] = pt.split(":").map(Number);
    const ok = await page.evaluate(([act, t]) => {
      const f = window.__kfilm;
      if (!f.trigger) return false;
      const P = f.clock.progressOf(act, t);
      window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" });
      return true;
    }, [act, t]);
    if (!ok) console.log("no trigger (still?)");
  }
  await page.waitForTimeout(Number(process.env.WAIT ?? 3000));
  const file = `${out}/${mode}-${w}x${h}-${pt.replace(/[:#]/g, "_")}.png`;
  await page.screenshot({ path: file });
  console.log(file);
}
if (logs.length) console.log(logs.join("\n"));
await browser.close();
