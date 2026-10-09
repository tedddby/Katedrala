import { chromium } from "playwright-core";
for (const args of [[], ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]]) {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args });
  const page = await browser.newPage();
  await page.setContent("<canvas id=c></canvas>");
  const r = await page.evaluate(() => {
    const t0 = performance.now();
    const a = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    const t1 = performance.now();
    const b = document.createElement("canvas").getContext("webgl2");
    return { caveatOk: a !== null, plainOk: b !== null, firstMs: +(t1 - t0).toFixed(1) };
  });
  console.log(JSON.stringify(args), JSON.stringify(r));
  await browser.close();
}
