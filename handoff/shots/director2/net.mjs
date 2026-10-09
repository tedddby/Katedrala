import { chromium } from "playwright-core";
import { gzipSync } from "node:zlib";
const modes = [
  { name: "film", args: [], reduced: false },
  { name: "reduced", args: [], reduced: true },
  { name: "nowebgl", args: ["--disable-webgl", "--disable-3d-apis"], reduced: false },
];
for (const route of ["/lab/cinematic/", "/"]) {
  for (const m of modes) {
    const browser = await chromium.launch({ channel: "msedge", headless: true, args: m.args });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: m.reduced ? "reduce" : "no-preference" });
    const page = await ctx.newPage();
    const js = [];
    page.on("response", async (r) => {
      const u = r.url();
      if (!u.endsWith(".js") && !u.endsWith(".json")) return;
      try { const b = await r.body(); js.push([u.split("/").pop(), b.length, gzipSync(b, { level: 9 }).length]); } catch {}
    });
    await page.goto("http://localhost:3199" + route, { waitUntil: "load" });
    await page.waitForTimeout(4000);
    const marks = await page.evaluate(() => {
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
      const ff = performance.getEntriesByName("kfilm:first-frame")[0]?.startTime;
      return { fcp: fcp && Math.round(fcp), firstFrame: ff && Math.round(ff), kfilm: document.documentElement.dataset.kfilm, live: document.documentElement.dataset.kfilmLive !== undefined };
    });
    const total = js.reduce((s, x) => s + x[2], 0);
    console.log(route, m.name, JSON.stringify(marks), "gzip total", total);
    for (const [n, r, g] of js.sort((a, b) => b[2] - a[2]).slice(0, 12)) console.log("   ", n.padEnd(32), r, g);
    await browser.close();
  }
}
