import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
for (const [width, height, phone] of [[1440, 900, false], [844, 390, true], [390, 844, true]]) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message.slice(0, 160)}`));
  page.on("console", async (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()} ${m.text().slice(0, 160).replace(/\n/g, " ")} @ ${m.location().url?.split("/").slice(-1)[0]}:${m.location().lineNumber}`); });
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  for (const id of ["history", "developers", "open-source", "ecosystem"]) { await page.locator(`#${id}`).scrollIntoViewIfNeeded(); await page.waitForTimeout(300); }
  console.log(`${width}x${height}: ${errors.length} messages`);
  for (const e of errors) console.log("  " + e);
  await context.close();
}
await browser.close();
