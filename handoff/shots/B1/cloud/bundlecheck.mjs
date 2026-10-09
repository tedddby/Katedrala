// Does any client script carry the graph JSON? Looks for a file path that only the data holds.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const hits = [];
const sizes = [];
page.on("response", async (r) => {
  const url = r.url();
  if (!/\.js(\?|$)/.test(url)) return;
  try {
    const body = await r.text();
    sizes.push([url.replace(/^https?:\/\/[^/]+/, ""), body.length]);
    if (body.includes("feature-mockups.tsx")) hits.push(url.replace(/^https?:\/\/[^/]+/, ""));
  } catch {}
});
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 30000 });
await page.waitForTimeout(2000);
console.log(JSON.stringify({ scripts: sizes.length, graphInScripts: hits }));
await browser.close();
