import { launch, open } from "./lib.mjs";
const browser = await launch();
const { page, context } = await open(browser, { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
console.log(await page.evaluate(() => {
  const svg = document.querySelector("#architecture .explorer-sheet svg");
  const out = [];
  for (const t of svg.querySelectorAll(".plan-member .plan-label")) {
    const bb = t.getBBox();
    const fs = parseFloat(getComputedStyle(t).fontSize);
    out.push([t.textContent, t.textContent.length, +(bb.width / fs).toFixed(3), +(bb.width / fs / t.textContent.length).toFixed(3), +(bb.height / fs).toFixed(3), +(bb.y / fs).toFixed(3)]);
  }
  for (const t of svg.querySelectorAll(".plan-bay-label")) {
    const bb = t.getBBox();
    const fs = parseFloat(getComputedStyle(t).fontSize);
    out.push(["BAY " + t.textContent, t.textContent.length, +(bb.width / fs).toFixed(3), +(bb.width / fs / t.textContent.length).toFixed(3), +(bb.height / fs).toFixed(3)]);
  }
  return out.map((r) => r.join("\t")).join("\n");
}));
await context.close(); await browser.close();
