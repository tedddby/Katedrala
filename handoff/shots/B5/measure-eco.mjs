import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
for (const width of [768, 800, 820, 900, 1024]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const caps = [...document.querySelectorAll(".eco-capital .status")];
    const tools = [...document.querySelectorAll(".eco-tool")];
    const s = document.querySelector(".eco-capital .status");
    // natural width of the widest label, measured unwrapped
    const probe = caps.map((c) => { const clone = c.cloneNode(true); clone.style.whiteSpace = "nowrap"; clone.style.position = "absolute"; document.body.appendChild(clone); const w = clone.getBoundingClientRect().width; clone.remove(); return Math.round(w * 10) / 10; });
    return { cell: Math.round(tools[0].getBoundingClientRect().width * 10) / 10, heights: caps.map((c) => Math.round(c.getBoundingClientRect().height)), natural: probe, ws: getComputedStyle(s).whiteSpace };
  });
  console.log(width, JSON.stringify(r));
  await page.close();
}
await browser.close();
