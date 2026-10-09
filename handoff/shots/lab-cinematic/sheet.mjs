// Contact sheet: node sheet.mjs <out.png> <cols> <width> <img1> <img2> ... (images scaled to <width> px each, labelled).
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { basename, resolve, dirname } from "node:path";
import { writeFileSync } from "node:fs";
const [out, colsArg, widthArg, ...imgs] = process.argv.slice(2);
const cols = Number(colsArg), w = Number(widthArg);
const cells = imgs.map((f) => `<figure><img src="${pathToFileURL(resolve(f)).href}" style="width:${w}px;display:block"><figcaption>${basename(f)}</figcaption></figure>`).join("");
const html = `<html><body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:6px;padding:6px;font:12px monospace;color:#ccc">${cells}<style>figure{margin:0}figcaption{padding:2px 0}</style></body></html>`;
const htmlPath = resolve(dirname(resolve(out)), "_sheet.html");
writeFileSync(htmlPath, html);
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: cols * (w + 6) + 6, height: 400 } });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("wrote", out);
