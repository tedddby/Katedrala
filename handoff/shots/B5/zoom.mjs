// Zoomed crops: node zoom.mjs <out.png> <width>x<height> <dpr> <selector> [padX] [padY] [--hover=<selector>]
import { chromium } from "playwright-core";
const [out, size, dpr, selector, padX = "20", padY = "20"] = process.argv.slice(2);
const hover = process.argv.find((a) => a.startsWith("--hover="))?.slice(8);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(dpr) });
await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: "body > header, body > a.skip-link { visibility: hidden !important; }" });
const el = page.locator(selector).first();
await el.scrollIntoViewIfNeeded();
if (hover) { await page.locator(hover).first().hover(); }
await page.waitForTimeout(600);
const box = await el.boundingBox();
await page.screenshot({ path: out, clip: { x: Math.max(0, box.x - +padX), y: Math.max(0, box.y - +padY), width: Math.min(width, box.width + 2 * +padX), height: box.height + 2 * +padY }, scale: "device" });
console.log(JSON.stringify(box));
await browser.close();
