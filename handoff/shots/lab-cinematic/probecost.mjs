import { chromium } from "playwright-core";
for (const args of [[], ["--disable-webgl", "--disable-3d-apis"]]) {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args });
  const results = [];
  for (let i = 0; i < 5; i++) {
    const page = await browser.newPage();
    await page.setContent(`<html><head><script>
      var t0 = performance.now(); var ok = false;
      try { var c = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true }); if (c) { ok = true; var l = c.getExtension("WEBGL_lose_context"); l && l.loseContext(); } } catch (e) {}
      window.__probe = [performance.now() - t0, ok, "WebGL2RenderingContext" in window];
    </script></head><body>x</body></html>`);
    results.push(await page.evaluate(() => window.__probe));
    await page.close();
  }
  console.log(JSON.stringify(args), JSON.stringify(results.map(([ms, ok, api]) => [+ms.toFixed(1), ok, api])));
  await browser.close();
}
