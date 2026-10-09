// "entry point" nowhere on the film (text, labels, alternative text); the gauge's "+" in the faintest ink.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
// Through the whole film, so every label and caption has been written at least once.
await page.evaluate(() => new Promise((res) => {
  const tr = window.__kfilm.trigger; const t0 = performance.now();
  const step = () => { const k = Math.min(1, (performance.now() - t0) / 9000); window.scrollTo({ top: tr.start + k * (tr.end - tr.start), behavior: "instant" }); if (k < 1) requestAnimationFrame(step); else setTimeout(res, 500); };
  requestAnimationFrame(step);
}));
const r = await page.evaluate(() => {
  const html = document.documentElement.outerHTML;
  const hits = [...html.matchAll(/entry[\s-]?points?/gi)].map((m) => html.slice(Math.max(0, m.index - 60), m.index + 40));
  const sign = document.querySelector("[data-film-gauge] span span");
  const faint = getComputedStyle(document.documentElement).getPropertyValue("--color-ink-faint").trim();
  return { entryPoint: hits, signText: sign.textContent, signColor: getComputedStyle(sign).color, inkFaint: faint };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
