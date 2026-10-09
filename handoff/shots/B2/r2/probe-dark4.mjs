import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(2000);
await page.evaluate((t) => { const f = window.__kfilm; const P = f.clock.progressOf(1, t); window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" }); }, 0.76);
await page.waitForTimeout(3000);
const shots = [
  ["diagram-hidden", () => { document.querySelector("[data-ev-diagram]").style.visibility = "hidden"; }],
  ["diagram-back", () => { document.querySelector("[data-ev-diagram]").style.visibility = ""; }],
  ["layer-hidden", () => { document.querySelector('[data-act-layer="evidence"]').style.visibility = "hidden"; }],
];
for (const [name, fn] of shots) {
  await page.evaluate(fn);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `r2/cap2/d4-${name}.png`, clip: { x: 800, y: 560, width: 640, height: 340 } });
}
console.log(await page.evaluate(() => { const svg = document.querySelector("[data-ev-lines]"); const r = svg.getBoundingClientRect(); return { svg: JSON.stringify(r), paths: [...svg.querySelectorAll("path")].map((p) => `${p.dataset.ev} op=${p.style.opacity} d=${(p.getAttribute("d") || "").slice(0, 60)}`) }; }));
await browser.close();
