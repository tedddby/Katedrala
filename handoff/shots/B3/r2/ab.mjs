// A/B of the film's start on two routes, alternated in one run, fresh context per load, after a warm-up of each.
import { chromium } from "playwright-core";
const [size = "1440x900", runs = "8", A, B] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const one = async (url) => {
  const touch = width < 768;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: touch ? 3 : 1, isMobile: touch, hasTouch: touch });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => performance.getEntriesByName("kfilm:first-frame").length > 0, null, { timeout: 30000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const at = (n) => performance.getEntriesByName(n)[0]?.startTime ?? NaN;
    const nav = performance.getEntriesByType("navigation")[0];
    return { dcl: nav.domContentLoadedEventEnd, start: at("kfilm:start"), first: at("kfilm:first-frame") };
  });
  await ctx.close();
  return r;
};
await one(A); await one(B);
const res = { A: [], B: [] };
for (let i = 0; i < Number(runs); i++) { res.A.push(await one(A)); res.B.push(await one(B)); }
const med = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return Math.round(s[Math.floor(s.length / 2)]); };
for (const k of ["A", "B"]) {
  const r = res[k];
  console.log(`${k} ${k === "A" ? A : B} ${size}: start ${med(r.map((x) => x.start))}  first-frame ${med(r.map((x) => x.first))}  start-DCL ${med(r.map((x) => x.start - x.dcl))}  DCL ${med(r.map((x) => x.dcl))}`);
}
await browser.close();
