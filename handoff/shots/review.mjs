// Review harness: scrolls the whole page so every drawing settles, then captures the first viewport and every
// section (fixed chrome hidden) at desktop and mobile widths. Reports console errors, overflow and skip-link state.
// Usage: node review.mjs <url> <outDir> [--reduced]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const [url = "http://localhost:3100/", outDir = "./review"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const reduced = process.argv.includes("--reduced");
mkdirSync(outDir, { recursive: true });

const SECTIONS = [
  "top",
  "how-it-works",
  "architecture",
  "gravity",
  "entropy",
  "impact",
  "rules",
  "evidence",
  "history",
  "developers",
  "open-source",
  "ecosystem",
  "get-started",
];
const viewports = [
  { tag: "desktop", width: 1440, height: 900, scale: 1 },
  { tag: "mobile", width: 390, height: 844, scale: 2 },
];

const browser = await chromium.launch({ channel: "msedge", headless: true });
const report = [];
for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    reducedMotion: reduced ? "reduce" : "no-preference",
    colorScheme: "dark",
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") report.push(`[${vp.tag}] ${msg.type()}: ${msg.text().slice(0, 300)}`);
  });
  page.on("pageerror", (err) => report.push(`[${vp.tag}] pageerror: ${err.message}`));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${outDir}/${vp.tag}-first-viewport.png` });

  // Skip link must sit above the viewport until focused.
  const skip = await page.evaluate(() => document.querySelector(".skip-link")?.getBoundingClientRect().bottom ?? null);
  if (skip !== null && skip > 0) report.push(`[${vp.tag}] skip link visible without focus (bottom ${skip}px)`);

  // Scroll through so every observer fires, then let the drawings finish.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += Math.round(vp.height * 0.6)) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
    await page.waitForTimeout(120);
  }
  await page
    .waitForFunction(
      () => [...document.querySelectorAll(".drawing")].every((d) => d.getAttribute("data-settle") !== "running" && d.getAttribute("data-settle") !== "pending" || d.offsetParent === null),
      null,
      { timeout: 8000 },
    )
    .catch(async () => {
      const states = await page.evaluate(() => [...document.querySelectorAll(".drawing")].map((d) => d.getAttribute("data-settle")));
      report.push(`[${vp.tag}] drawings not settled: ${states.join(",")}`);
    });
  await page.waitForTimeout(300);

  await page.addStyleTag({ content: ".site-nav, .skip-link, nextjs-portal { visibility: hidden !important; }" });
  for (const id of SECTIONS) {
    const section = page.locator(`#${id}`);
    if ((await section.count()) === 0) {
      report.push(`[${vp.tag}] missing section #${id}`);
      continue;
    }
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await section.screenshot({ path: `${outDir}/${vp.tag}-${id}.png` });
  }
  await page.locator("footer").screenshot({ path: `${outDir}/${vp.tag}-footer.png` });

  // Full page, chrome visible, from the document top.
  await page.evaluate(() => document.querySelectorAll("style").forEach((el) => { if (el.textContent.includes("visibility: hidden !important")) el.remove(); }));
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${vp.tag}.png`, fullPage: true, scale: "css" });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) report.push(`[${vp.tag}] horizontal overflow: ${overflow}px`);
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll("main *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > document.documentElement.clientWidth + 1 || r.left < -1);
      })
      .filter((el) => !el.closest(".code-block-body, .history, .command-schedule, .explorer-sheet, svg"))
      .slice(0, 8)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`),
  );
  if (wide.length) report.push(`[${vp.tag}] elements past the edge: ${wide.join(" | ")}`);
  await context.close();
}
await browser.close();
console.log(report.length ? report.join("\n") : "no console errors, no overflow");
