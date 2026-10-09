import { chromium } from "playwright-core";
const url = process.argv[2] ?? "http://localhost:3100/";
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(m.type(), m.text().slice(0, 400)); });
page.on("pageerror", (e) => console.log("pageerror", String(e).slice(0, 400)));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await browser.close();
