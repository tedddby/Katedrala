// History renders identically with entropy.css removed: (1) no element of #history matches any selector of
// entropy.css; (2) #history's pixels are identical before and after deleting entropy.css's rules from the page.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
const css = readFileSync("/katedrala/site/app/styles/entropy.css", "utf8");
const browser = await chromium.launch({ channel: "msedge" });
for (const [width, height, dpr] of [[1440, 900, 1], [390, 844, 2]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "body > header, body > a.skip-link { visibility: hidden !important; } main > section:not(#history), body > footer { display: none !important; }" });
  await page.locator("#history").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const before = await page.locator("#history").screenshot({ scale: "css" });
  const result = await page.evaluate((text) => {
    const probe = new CSSStyleSheet();
    probe.replaceSync(text.replace(/@layer\s+components\s*\{/, "@media all {"));
    const selectors = new Set();
    const walk = (rules) => { for (const r of rules) { if (r.selectorText) selectors.add(r.selectorText.replace(/\s+/g, "")); if (r.cssRules) walk(r.cssRules); } };
    walk(probe.cssRules);
    const history = document.querySelector("#history");
    const matched = [];
    for (const s of selectors) {
      for (const part of s.split(",")) {
        try { if (history.matches(part) || history.querySelector(part)) matched.push(part); } catch {}
      }
    }
    // Delete the page's rules whose selector is one of entropy.css's.
    let removed = 0;
    const prune = (list, owner) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const r = list[i];
        if (r.selectorText && selectors.has(r.selectorText.replace(/\s+/g, ""))) { owner.deleteRule(i); removed++; }
        else if (r.cssRules) prune(r.cssRules, r);
      }
    };
    for (const sheet of document.styleSheets) { try { prune(sheet.cssRules, sheet); } catch {} }
    return { selectors: selectors.size, matched, removed };
  }, css);
  await page.waitForTimeout(300);
  const after = await page.locator("#history").screenshot({ scale: "css" });
  const a = PNG.sync.read(before), b = PNG.sync.read(after);
  let diff = 0;
  if (a.width === b.width && a.height === b.height) {
    for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) diff++;
  } else diff = -1;
  // Sanity: the same deletion does change the Entropy section.
  const entropyJoint = await page.evaluate(() => { const j = document.querySelector("#entropy .entropy-joint"); return j ? getComputedStyle(j).stroke : "none"; });
  console.log(`${width}: entropy.css selectors ${result.selectors}, History elements matching any: ${result.matched.length} ${JSON.stringify(result.matched)}, page rules deleted ${result.removed}, History size ${a.width}x${a.height} vs ${b.width}x${b.height}, differing pixels ${diff}; entropy joint stroke after deletion: ${entropyJoint}`);
  await page.close();
}
await browser.close();
