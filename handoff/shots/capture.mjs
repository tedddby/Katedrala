// Review captures of the built site, served in-process from site/out (no background server needed):
// first viewports, every section, the footer, and full pages stitched from segments, because Chromium wraps
// single full-page captures taller than about 16,384 device pixels.
// Usage: node capture.mjs <outDir> [--reduced]
import { createReadStream, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";

const OUT = resolve("/katedrala/site/out");
const outDir = process.argv[2] ?? "./captures";
const reduced = process.argv.includes("--reduced");
mkdirSync(outDir, { recursive: true });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain", ".json": "application/json" };
function locate(pathname) {
  const file = resolve(OUT, normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, ""));
  if (file !== OUT && !file.startsWith(OUT + sep)) return undefined;
  try {
    const stat = statSync(file);
    if (stat.isFile()) return file;
    if (stat.isDirectory() && statSync(join(file, "index.html")).isFile()) return join(file, "index.html");
  } catch {}
  return undefined;
}
const server = createServer((req, res) => {
  const file = locate(new URL(req.url ?? "/", "http://x").pathname);
  const target = file ?? join(OUT, "404.html");
  res.writeHead(file ? 200 : 404, { "content-type": TYPES[extname(target)] ?? "application/octet-stream" });
  createReadStream(target).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

const SECTIONS = ["top", "how-it-works", "architecture", "gravity", "entropy", "impact", "rules", "evidence", "history", "developers", "open-source", "ecosystem", "get-started"];
const viewports = [
  { tag: "desktop", width: 1440, height: 900, scale: 1 },
  { tag: "mobile", width: 390, height: 844, scale: 2 },
];
const report = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });

async function stitchFullPage(page, width, path) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const png = new PNG({ width, height });
  const SEGMENT = 4000;
  for (let y = 0; y < height; y += SEGMENT) {
    const h = Math.min(SEGMENT, height - y);
    const buffer = await page.screenshot({ clip: { x: 0, y, width, height: h }, fullPage: true, scale: "css" });
    const part = PNG.sync.read(buffer);
    if (part.width !== width || part.height !== h) report.push(`segment ${y}: got ${part.width}x${part.height}, expected ${width}x${h}`);
    PNG.bitblt(part, png, 0, 0, Math.min(part.width, width), Math.min(part.height, h), 0, y);
  }
  writeFileSync(path, PNG.sync.write(png));
  return height;
}

for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    reducedMotion: reduced ? "reduce" : "no-preference",
    colorScheme: "dark",
  });
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") report.push(`[${vp.tag}] ${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => report.push(`[${vp.tag}] pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${outDir}/${vp.tag}-first-viewport.png` });

  // Scroll through so every observer fires, then let the drawings finish settling.
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += Math.round(vp.height * 0.6)) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
    await page.waitForTimeout(110);
  }
  await page.waitForTimeout(1500);

  // Full page with chrome, from the document top.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(500);
  const h = await stitchFullPage(page, vp.width, `${outDir}/${vp.tag}.png`);
  report.push(`[${vp.tag}] full page ${vp.width}x${h}`);

  // Sections and footer, fixed chrome hidden.
  await page.addStyleTag({ content: ".site-nav, .skip-link { visibility: hidden !important; }" });
  for (const id of SECTIONS) {
    const section = page.locator(`#${id}`);
    if ((await section.count()) === 0) { report.push(`[${vp.tag}] missing #${id}`); continue; }
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await section.screenshot({ path: `${outDir}/${vp.tag}-${id}.png` });
  }
  await page.locator("footer").screenshot({ path: `${outDir}/${vp.tag}-footer.png` });
  await context.close();
}
await browser.close();
server.close();
console.log(report.join("\n") || "done");
