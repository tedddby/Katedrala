// Loading metrics for a URL: LCP, CLS, long tasks (total blocking time), bytes, with optional throttling.
import { chromium } from "playwright-core";
const url = process.argv[2];
const runs = [
  { tag: "desktop", width: 1440, height: 900, throttle: null },
  { tag: "mobile (4x CPU, ~9 Mbps, 150 ms RTT)", width: 390, height: 844, throttle: { cpu: 4, down: (9 * 1024 * 1024) / 8, up: (1.5 * 1024 * 1024) / 8, latency: 150 } },
];
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const run of runs) {
  const context = await browser.newContext({ viewport: { width: run.width, height: run.height } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (run.throttle) {
    await cdp.send("Network.emulateNetworkConditions", { offline: false, downloadThroughput: run.throttle.down, uploadThroughput: run.throttle.up, latency: run.throttle.latency });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: run.throttle.cpu });
  }
  let bytes = 0;
  cdp.on("Network.loadingFinished", (e) => { bytes += e.encodedDataLength; });
  await page.addInitScript(() => {
    window.__lcp = 0; window.__cls = 0; window.__tbt = 0; window.__long = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__long += 1; window.__tbt += Math.max(0, e.duration - 50); } }).observe({ type: "longtask", buffered: true });
  });
  const start = Date.now();
  await page.goto(url, { waitUntil: "load" });
  const loadMs = Date.now() - start;
  await page.waitForTimeout(3000);
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    return { fcp, lcp: window.__lcp, cls: window.__cls, tbt: window.__tbt, long: window.__long, dcl: nav.domContentLoadedEventEnd };
  });
  console.log(`${run.tag}: FCP ${m.fcp.toFixed(0)} ms, LCP ${m.lcp.toFixed(0)} ms, CLS ${m.cls.toFixed(3)}, TBT ${m.tbt.toFixed(0)} ms (${m.long} long tasks), DCL ${m.dcl.toFixed(0)} ms, load ${loadMs} ms, transferred ${(bytes / 1024).toFixed(0)} KB`);
  await context.close();
}
await browser.close();
