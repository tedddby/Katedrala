// Full-page capture (for the still layouts): node fullpage.mjs <out.png> <W>x<H> [--reduced] [--nowebgl]
import { chromium } from "playwright-core";
const [out, size, ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const args = rest.includes("--nowebgl") ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const mobile = width < 600;
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: rest.includes("--reduced") ? "reduce" : "no-preference" });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForTimeout(4000);
await page.screenshot({ path: out, fullPage: true });
console.log("wrote", out, await page.evaluate(() => document.documentElement.scrollHeight));
await browser.close();
