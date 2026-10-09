import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
for (const [width, height, phone] of [[1440, 900, false], [390, 844, true]]) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 });
  const page = await context.newPage();
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const m = await page.evaluate(() => {
    const h = (id) => Math.round(document.getElementById(id).getBoundingClientRect().height);
    const pad = parseFloat(getComputedStyle(document.getElementById("history")).paddingTop);
    const frames = [...document.querySelectorAll(".history-frame")].map((f) => Math.round(f.getBoundingClientRect().width));
    const strip = document.querySelector(".history-strip").getBoundingClientRect();
    const band = getComputedStyle(document.querySelector(".history-strip"), "::before");
    const rows = [...document.querySelectorAll(".gauge-row")].map((r) => Math.round(r.getBoundingClientRect().height));
    const gauge = document.querySelector(".gauge").getBoundingClientRect();
    const shaft = getComputedStyle(document.querySelector(".eco-tool .eco-capital"), "::after");
    const beam = document.querySelector(".eco-beam").getBoundingClientRect();
    const beamBefore = getComputedStyle(document.querySelector(".eco-beam"), "::before");
    const joints = [...document.querySelectorAll(".eco-joint")].map((j) => Math.round(j.getBoundingClientRect().left + 5));
    const tools = [...document.querySelectorAll(".eco-tool")].map((t) => Math.round(t.getBoundingClientRect().left));
    return {
      sectionPaddingTop: pad,
      heights: { history: h("history"), developers: h("developers"), "open-source": h("open-source"), ecosystem: h("ecosystem") },
      historyFrames: frames, stripHeight: Math.round(strip.height), bandSpan: band.content === "none" ? "none (phone: the strip itself bleeds)" : `${band.left} .. ${band.right}`,
      gaugeHeight: Math.round(gauge.height), gaugeRows: [...new Set(rows)],
      shaftHeight: shaft.height, beamWidth: Math.round(beam.width), beamBleed: `${beamBefore.left} / ${beamBefore.right}`,
      jointCenters: joints, toolLefts: tools,
    };
  });
  console.log(`${width}x${height}: ${JSON.stringify(m)}`);
  await context.close();
}
await browser.close();
