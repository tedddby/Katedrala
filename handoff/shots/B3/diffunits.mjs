// Copy and accessibility-tree diff of B3's units against the sealed baseline (plan 4.4 acceptance): innerText and
// Playwright ariaSnapshot of the skip links, the header, the hinge, the final statement and the footer, at the
// baseline's two viewports. Writes the current records beside the diff.
// Usage: node diffunits.mjs <outDir> [--url=http://localhost:3100/]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const out = resolve(args.find((a) => !a.startsWith("--")) ?? "./diff");
const URL_ = (args.find((a) => a.startsWith("--url=")) ?? "--url=http://localhost:3100/").slice(6);
const BASE =
  "/katedrala/handoff/lab/promotion/baseline";
const UNITS = {
  "skip-link": "body > a.skip-link",
  header: "body > header",
  "how-it-works": "main > section#how-it-works",
  "get-started": "main > section#get-started",
  footer: "body > footer",
};
const VIEWPORTS = [
  { tag: "1440", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { tag: "390", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

/** A line diff (longest common subsequence), as "- old" and "+ new" lines. */
function diff(a, b) {
  const x = a.split("\n");
  const y = b.split("\n");
  const m = x.length;
  const n = y.length;
  const L = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const lines = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (x[i] === y[j]) {
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) lines.push(`- ${x[i++]}`);
    else lines.push(`+ ${y[j++]}`);
  }
  while (i < m) lines.push(`- ${x[i++]}`);
  while (j < n) lines.push(`+ ${y[j++]}`);
  return lines;
}

const browser = await chromium.launch({ channel: "msedge" });
const summary = [];
for (const vp of VIEWPORTS) {
  const dir = join(out, vp.tag);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    reducedMotion: "no-preference",
    colorScheme: "dark",
  });
  const page = await context.newPage();
  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  for (const [unit, selector] of Object.entries(UNITS)) {
    const locators = page.locator(selector);
    const count = await locators.count();
    let text = "";
    let aria = "";
    for (let k = 0; k < count; k++) {
      const l = locators.nth(k);
      text += (k ? "\n" : "") + (await l.evaluate((el) => el.innerText));
      aria += (k ? "\n" : "") + (await l.ariaSnapshot());
    }
    writeFileSync(join(dir, `${unit}.txt`), `${text}\n`);
    writeFileSync(join(dir, `${unit}.aria.yml`), `${aria}\n`);
    for (const [kind, now] of [
      ["txt", `${text}\n`],
      ["aria.yml", `${aria}\n`],
    ]) {
      const before = readFileSync(join(BASE, vp.tag, `${unit}.${kind}`), "utf8").replace(/\r\n/g, "\n");
      const d = diff(before.trimEnd(), now.trimEnd());
      summary.push(`## ${vp.tag} ${unit}.${kind}: ${d.length === 0 ? "identical" : `${d.length} changed lines`}`);
      if (d.length) summary.push(...d.map((line) => `    ${line}`));
    }
  }
  await context.close();
}
await browser.close();
writeFileSync(join(out, "diff.txt"), `${summary.join("\n")}\n`);
console.log(summary.join("\n"));
