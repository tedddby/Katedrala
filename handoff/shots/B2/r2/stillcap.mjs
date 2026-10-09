// Still mode: full-page stitch of the film section (by scrolling the window), plus the console.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const [out, size, mode = "still"] = process.argv.slice(2);
const [w, h] = size.split("x").map(Number);
mkdirSync(out, { recursive: true });
const args = mode === "nowebgl" ? ["--disable-webgl", "--disable-3d-apis"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const mobile = w < 600;
const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, reducedMotion: mode === "still" ? "reduce" : "no-preference" });
const logs = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`${m.type()}: ${m.text()}`); });
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(1500);
console.log("mode", await page.evaluate(() => document.documentElement.dataset.kfilm));
// Each act block: scroll its slot into view in steps and capture.
for (const id of ["evidence", "change", "trace"]) {
  const box = await page.evaluate((id) => { const el = document.querySelector(`[data-act-slot="${id}"]`); const r = el.getBoundingClientRect(); return { top: r.top + scrollY, height: r.height }; }, id);
  let y = box.top - 40, i = 0;
  while (y < box.top + box.height && i < 6) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${mode}-${w}x${h}-${id}-${i}.png` });
    y += h - 80; i++;
  }
  console.log(id, JSON.stringify(box), i, "shots");
}
if (logs.length) console.log(logs.join("\n"));
await browser.close();
