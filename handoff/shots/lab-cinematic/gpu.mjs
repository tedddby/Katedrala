import { chromium } from "playwright-core";
for (const args of [[], ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"], ["--ignore-gpu-blocklist", "--enable-gpu"]]) {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args });
  const page = await browser.newPage();
  await page.setContent("<canvas id=c></canvas>");
  const info = await page.evaluate(() => {
    const gl = document.getElementById("c").getContext("webgl2");
    if (!gl) return "no webgl2";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) + " | " + gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  console.log(JSON.stringify(args), "=>", info);
  await browser.close();
}
