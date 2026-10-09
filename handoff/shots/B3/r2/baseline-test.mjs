import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
await page.setContent(`<div id=g style="display:grid;grid-template-columns:200px 300px 200px;grid-template-rows:auto 1fr;font-family:sans-serif">
<h3 id=v style="grid-column:1;grid-row:1;align-self:baseline;font-size:28px;line-height:1.2;margin:0">Parse</h3>
<p id=s style="grid-column:1;grid-row:2;margin:8px 0 0">status</p>
<p id=t style="grid-column:2;grid-row:1/span 2;align-self:baseline;font-size:15px;line-height:1.65;margin:0">Each TypeScript and JavaScript file becomes symbols, imports, exports and references and more words to wrap three lines here.</p>
<dl id=a style="grid-column:3;grid-row:1/span 2;align-self:baseline;display:grid;grid-template-columns:80px 1fr;font:12px/1.6 monospace;margin:0"><dt>file</dt><dd style=margin:0>cache-key.ts</dd><dt>symbols</dt><dd style=margin:0>4</dd><dt>fn</dt><dd style=margin:0>graphCacheKey</dd><dt>x</dt><dd style=margin:0>y</dd><dt>x</dt><dd style=margin:0>y</dd></dl>
</div>`);
const r = await page.evaluate(() => {
  const base = (el) => { const r = document.createRange(); r.selectNodeContents(el.firstChild.nodeType === 3 ? el : el.querySelector("dt")); const rects = r.getClientRects(); return rects[0]; };
  const out = {};
  for (const id of ["v", "s", "t", "a"]) { const el = document.getElementById(id); const b = el.getBoundingClientRect(); out[id] = { top: b.top, bottom: b.bottom }; }
  // baselines via an inline-block probe
  const probe = (el) => { const s = document.createElement("span"); s.style.cssText = "display:inline-block;width:1px;height:0;vertical-align:baseline"; (el.tagName === "DL" ? el.querySelector("dt") : el).prepend(s); const y = s.getBoundingClientRect().top; s.remove(); return y; };
  out.baselines = { v: probe(document.getElementById("v")), t: probe(document.getElementById("t")), a: probe(document.getElementById("a")) };
  out.rows = getComputedStyle(document.getElementById("g")).gridTemplateRows;
  return out;
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
