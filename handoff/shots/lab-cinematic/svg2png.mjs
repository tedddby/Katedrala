// Renders SVG files to PNG (and optionally composes several into one sheet).
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const [out, ...files] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1800, height: 1400 } });
const html = `<html><body style="margin:0;background:#0e1012;display:grid;grid-template-columns:repeat(2,900px)">${files.map((f) => `<div>${readFileSync(f, "utf8")}</div>`).join("")}</body></html>`;
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
