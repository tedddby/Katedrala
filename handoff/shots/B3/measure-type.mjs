// Measures how the hinge heading and lede set at given widths, using the page's own fonts and classes.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
const out = {};
for (const width of [1280, 1350, 1440, 1920]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  out[width] = await page.evaluate(() => {
    const frame = document.querySelector("#how-it-works .frame");
    const probe = document.createElement("div");
    probe.className = "grid-12";
    probe.innerHTML = `<div style="grid-column: span 4" id="c4"></div><div style="grid-column: span 5" id="c5"></div><div style="grid-column: span 6" id="c6"></div>`;
    frame.append(probe);
    const res = {};
    for (const id of ["c4", "c5", "c6"]) {
      const cell = probe.querySelector("#" + id);
      cell.innerHTML = `<h2 class="display">From source code to architecture.</h2><p class="lede">Katedrala is designed as five passes. Each adds to the document and never rewrites what an earlier pass produced.</p>`;
      const h = cell.querySelector("h2");
      const p = cell.querySelector("p");
      const lh = (el) => parseFloat(getComputedStyle(el).lineHeight);
      // Widest single word in the heading
      const r = document.createRange();
      let widest = 0;
      const text = h.firstChild;
      const words = text.textContent.split(" ");
      let pos = 0;
      for (const w of words) {
        r.setStart(text, pos); r.setEnd(text, pos + w.length);
        widest = Math.max(widest, r.getBoundingClientRect().width);
        pos += w.length + 1;
      }
      res[id] = {
        cell: cell.getBoundingClientRect().width,
        h2Size: getComputedStyle(h).fontSize,
        h2Lines: Math.round(h.getBoundingClientRect().height / lh(h)),
        widestWord: Math.round(widest),
        ledeSize: getComputedStyle(p).fontSize,
        ledeLines: Math.round(p.getBoundingClientRect().height / lh(p)),
      };
    }
    probe.remove();
    return res;
  });
  await page.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
