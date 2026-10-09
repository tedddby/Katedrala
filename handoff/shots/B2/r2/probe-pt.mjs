import { chromium } from "playwright-core";
const [act, t, ...pts] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(2000);
await page.evaluate(([act, t]) => { const f = window.__kfilm; const P = f.clock.progressOf(act, t); window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" }); }, [Number(act), Number(t)]);
await page.waitForTimeout(3000);
for (const p of pts) {
  const [x, y] = p.split(",").map(Number);
  console.log(p, await page.evaluate(([x, y]) => document.elementsFromPoint(x, y).slice(0, 6).map((e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.split(" ").join(".") : ""}${[...e.attributes].filter((a) => a.name.startsWith("data-")).map((a) => `[${a.name}]`).join("")}`).join(" > "), [x, y]));
}
await browser.close();
