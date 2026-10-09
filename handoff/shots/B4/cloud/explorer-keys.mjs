// Explorer keyboard: zoomed in, ArrowRight through every member keeps the focused member (joint and name) inside
// the sheet; Up and Down move between rows; Escape clears; + and - zoom; 0 fits.
import { VIEWPORTS, launch, open, scrollTo } from "./lib.mjs";
const w = process.argv[2] ?? "1440";
const browser = await launch();
const { page, context } = await open(browser, VIEWPORTS[w]);
await scrollTo(page, "#architecture", 0);
const members = page.locator('#architecture [role="radio"][data-mode="members"]');
if ((await members.getAttribute("aria-checked")) !== "true") await members.click();
await page.waitForTimeout(700);
for (let i = 0; i < 3; i++) { await page.locator('#architecture [aria-label="Zoom in"]').click(); await page.waitForTimeout(350); }
// Focus the plan's tab stop from the keyboard.
await page.locator('#architecture [aria-label="Fit the plan"]').focus();
await page.keyboard.press("Tab");
await page.waitForTimeout(500);
const check = () => page.evaluate(() => {
  const el = document.activeElement;
  const sheet = document.querySelector("#architecture .explorer-sheet > svg").getBoundingClientRect();
  const label = el.querySelector(".plan-label").getBoundingClientRect();
  const joint = el.querySelector(".plan-joint").getBoundingClientRect();
  const inside = (r) => r.left >= sheet.left - 0.5 && r.right <= sheet.right + 0.5 && r.top >= sheet.top - 0.5 && r.bottom <= sheet.bottom + 0.5;
  return { id: el.dataset.id, checked: el.getAttribute("aria-checked"), joint: inside(joint), label: inside(label) };
});
const seen = [];
let first = await check();
seen.push(first);
for (let i = 0; i < 16; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(420); seen.push(await check()); }
const bad = seen.filter((s) => !s.joint || !s.label);
console.log(w, "order:", seen.map((s) => s.id).join(" > "));
console.log(w, "kept inside:", seen.length - bad.length, "of", seen.length, bad.length ? JSON.stringify(bad) : "");
await page.keyboard.press("ArrowDown"); await page.waitForTimeout(400); const down = await check();
await page.keyboard.press("ArrowUp"); await page.waitForTimeout(400); const up = await check();
await page.keyboard.press("Escape"); await page.waitForTimeout(200); const esc = await check();
console.log(w, "down", down.id, "up", up.id, "escape clears:", esc.checked === "false");
await page.keyboard.press("0"); await page.waitForTimeout(500);
const fitted = await page.evaluate(() => document.querySelector('#architecture [aria-label="Fit the plan"]').getAttribute("aria-disabled"));
console.log(w, "0 fits:", fitted);
await context.close(); await browser.close();
