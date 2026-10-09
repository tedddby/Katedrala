// Plan 3.4: does hydrating the plates after the film delay the film's first frame? kfilm:start (the director's
// mount), kfilm:first-frame and FCP on two routes, alternating, fresh context per load, after one warm-up each.
// usage: node firstframe.mjs <W>x<H> <runs> <urlA> <urlB> [--reduced]
import { chromium } from "playwright-core";
const [size = "1440x900", runs = "5", A = "http://localhost:3100/lab/cinematic/", B = "http://localhost:3100/lab/promoted/", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const reduced = rest.includes("--reduced");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const one = async (url) => {
  const touch = width < 768;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: touch ? 3 : 1, isMobile: touch, hasTouch: touch, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" });
  const r = await page.waitForFunction(() => performance.getEntriesByName("kfilm:first-frame").length > 0, null, { timeout: 30000 }).then(
    () =>
      page.evaluate(() => {
        const at = (n) => Math.round(performance.getEntriesByName(n)[0]?.startTime ?? NaN);
        const fcp = Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? NaN);
        const nav = performance.getEntriesByType("navigation")[0];
        return { fcp, start: at("kfilm:start"), first: at("kfilm:first-frame"), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) };
      }),
    () => null,
  );
  await ctx.close();
  return r;
};
await one(A);
await one(B);
const res = { A: [], B: [] };
for (let i = 0; i < Number(runs); i++) {
  res.A.push(await one(A));
  res.B.push(await one(B));
}
const med = (xs) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
for (const [k, url] of [["A", A], ["B", B]]) {
  const rows = res[k].filter(Boolean);
  console.log(`${k} ${url} ${size}${reduced ? " reduced" : ""}: n=${rows.length}  FCP ${med(rows.map((r) => r.fcp))}  DCL ${med(rows.map((r) => r.dcl))}  kfilm:start ${med(rows.map((r) => r.start))}  first-frame ${med(rows.map((r) => r.first))}  (first-frame - FCP ${med(rows.map((r) => r.first - r.fcp))})`);
  console.log("   " + rows.map((r) => `${r.start}/${r.first}`).join("  "));
}
await browser.close();
