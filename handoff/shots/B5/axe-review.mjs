import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await page.addScriptTag({ content: axeSource });
const r = await page.evaluate(async () => {
  const res = await window.axe.run({ include: [["#history"], ["#developers"], ["#open-source"], ["#ecosystem"]] }, { runOnly: ["color-contrast"], resultTypes: ["incomplete"] });
  const lum = (hex) => { const c = hex.match(/\d+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  // The ground each text actually sits on: the nearest ancestor (or band/slab pseudo) with an opaque fill.
  const ground = (el) => {
    for (let n = el; n; n = n.parentElement) {
      if (n.matches(".history")) return "rgb(10, 11, 13)"; // sheet-deep band
      if (n.matches(".eco-foundation")) return "rgb(20, 23, 26)"; // sheet-raised slab
      if (n.matches(".code-block")) return "rgb(10, 11, 13)";
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && !bg.endsWith(", 0)") && bg !== "transparent") return bg;
    }
    return "rgb(14, 16, 18)";
  };
  const out = new Map();
  for (const item of res.incomplete) for (const node of item.nodes) {
    const el = document.querySelector(node.target[0]);
    if (!el) continue;
    const fg = getComputedStyle(el).color, bg = ground(el);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const key = `${fg} on ${bg}`;
    const prev = out.get(key) ?? { ratio: ratio.toFixed(2), n: 0, reason: node.any?.[0]?.message?.slice(0, 60) ?? "", sample: (el.textContent || "").trim().slice(0, 30) };
    prev.n++;
    out.set(key, prev);
  }
  return [...out.entries()].map(([k, v]) => `${v.n}x ${k}: ${v.ratio}:1 (${v.reason}) e.g. "${v.sample}"`);
});
console.log(r.join("\n"));
await browser.close();
