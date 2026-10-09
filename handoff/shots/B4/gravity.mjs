// Gravity: captures, term toggles (lit sets and the status sentence), the cascade on a pointer choice, keyboard.
import { OUT, VIEWPORTS, launch, open, scrollTo, captureSection, frames } from "./lib.mjs";

const browser = await launch();
const widths = (process.argv[2] ?? "1440,390").split(",");
for (const w of widths) {
  const vp = VIEWPORTS[w];
  const { page, messages, context } = await open(browser, vp);
  await scrollTo(page, "#gravity", 0);
  await page.waitForTimeout(400);
  await captureSection(page, vp, "gravity", `${OUT}gravity-${w}-database-reach.png`);
  const state = () =>
    page.evaluate(() => {
      const root = document.querySelector("#gravity");
      const drawing = root.querySelector(".drawing");
      const litMembers = drawing
        ? [...drawing.querySelectorAll('.drawing-member[data-relation="carried"]')].map((g) => g.querySelector("text").textContent)
        : [];
      const litEdges = drawing ? drawing.querySelectorAll('.drawing-edge[data-relation="carried"]').length : 0;
      const schedLit = [...root.querySelectorAll('.schedule-member[data-relation="lit"]')].map((li) => li.firstChild?.nextSibling?.textContent ?? li.textContent);
      return {
        status: root.querySelector('[role="status"]').textContent,
        heading: root.querySelector("h3").textContent,
        pressed: [...root.querySelectorAll(".term-show")].map((b) => `${b.getAttribute("aria-label")}=${b.getAttribute("aria-pressed")}`),
        litMembers,
        litEdges,
        schedLit,
        caption: root.querySelector("figure > figcaption").textContent,
        img: drawing?.querySelector("svg").getAttribute("aria-label"),
      };
    });
  console.log(w, "default", JSON.stringify(await state()));
  const toggles = page.locator("#gravity .term-show");
  for (let i = 0; i < 4; i++) {
    await toggles.nth(i).scrollIntoViewIfNeeded();
    await toggles.nth(i).click();
    await page.waitForTimeout(250);
    const s = await state();
    console.log(w, "toggle", i, JSON.stringify({ status: s.status, pressed: s.pressed, litMembers: s.litMembers.length, litEdges: s.litEdges, schedLit: s.schedLit.length, caption: s.caption }));
  }
  // Release brokerage: nothing lit.
  await toggles.nth(3).click();
  await page.waitForTimeout(250);
  console.log(w, "released", JSON.stringify((await state()).status));
  // Back to reach; choose PaymentService by pointer and sample the cascade.
  await toggles.nth(0).click();
  await page.waitForTimeout(250);
  const choice = page.locator('#gravity [role="radio"]').nth(1);
  await choice.scrollIntoViewIfNeeded();
  const samples = [];
  await choice.click();
  for (let i = 0; i < 14; i++) {
    samples.push(
      await page.evaluate(() => {
        const d = document.querySelector("#gravity .drawing");
        if (!d) return null;
        const lit = [...d.querySelectorAll('.drawing-edge[data-relation="carried"]')];
        return lit.map((e) => (+getComputedStyle(e).opacity).toFixed(2)).join(",");
      }),
    );
    await page.waitForTimeout(40);
  }
  console.log(w, "cascade (edges in load blue / lit, every 50 ms):", samples.join(" "));
  const p = await state();
  console.log(w, "PaymentService", JSON.stringify({ status: p.status, heading: p.heading }));
  await scrollTo(page, "#gravity", 0);
  await page.waitForTimeout(500);
  await captureSection(page, vp, "gravity", `${OUT}gravity-${w}-payment-reach.png`);
  // Brokerage of PaymentService.
  await toggles.nth(3).scrollIntoViewIfNeeded();
  await toggles.nth(3).click();
  await page.waitForTimeout(400);
  const b = await state();
  console.log(w, "PaymentService brokerage", JSON.stringify({ status: b.status, litMembers: b.litMembers, caption: b.caption }));
  await scrollTo(page, "#gravity", 0);
  await page.waitForTimeout(300);
  await captureSection(page, vp, "gravity", `${OUT}gravity-${w}-payment-brokerage.png`);
  // Keyboard: arrow in the radiogroup lands at once.
  await choice.focus();
  await page.keyboard.press("ArrowRight");
  await frames(page, 1);
  const k = await page.evaluate(() => document.querySelector("#gravity .drawing")?.dataset.arrival);
  console.log(w, "keyboard arrival", k, JSON.stringify((await state()).heading));
  console.log(w, "messages", messages);
  await context.close();
}
await browser.close();
