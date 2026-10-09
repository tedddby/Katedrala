// Entropy: captures, the chain motion of commit arcs (pointer), instant keyboard steps, deltas adding up.
import { OUT, VIEWPORTS, launch, open, scrollTo, captureSection, frames } from "./lib.mjs";

const browser = await launch();
const widths = (process.argv[2] ?? "1440,390").split(",");
for (const w of widths) {
  const vp = VIEWPORTS[w];
  const { page, messages, context } = await open(browser, vp);
  await scrollTo(page, "#entropy", 0);
  await page.waitForTimeout(400);
  await captureSection(page, vp, "entropy", `${OUT}entropy-${w}-step0.png`);

  // Deltas add up to each score.
  const rows = await page.$$eval("#entropy .commit", (els) =>
    els.map((el) => ({ name: el.textContent.replace(/\s+/g, " ").trim(), move: el.querySelector(".commit-move")?.textContent })),
  );
  console.log(w, "rows", JSON.stringify(rows));

  // Pointer: apply +5 and sample the arcs as they drop in.
  const sample = () =>
    page.$$eval("#entropy .chain", (gs) =>
      gs.map((g) => ({ present: g.dataset.present, opacity: g.style.opacity, d: g.firstElementChild.getAttribute("d") })),
    );
  const before = await sample();
  await page.locator("#entropy .commit").nth(5).scrollIntoViewIfNeeded();
  const t0 = Date.now();
  await page.locator("#entropy .commit").nth(5).click();
  const timeline = [];
  let settledAt = null;
  for (let i = 0; i < 60; i++) {
    const s = await sample();
    const moving = s.filter((c) => c.opacity !== "");
    timeline.push({ t: Date.now() - t0, moving: moving.length, sample: moving.slice(0, 2).map((c) => `${c.opacity} ${c.d?.slice(0, 60)}`) });
    if (moving.length === 0 && i > 0) {
      settledAt = Date.now() - t0;
      break;
    }
    await page.waitForTimeout(20);
  }
  console.log(w, "pointer +5: settled after", settledAt, "ms (includes sampling latency)");
  for (const row of timeline.slice(0, 12)) console.log("  ", row.t, row.moving, row.sample.join(" | "));
  await page.waitForTimeout(300);
  await scrollTo(page, "#entropy", 0);
  await captureSection(page, vp, "entropy", `${OUT}entropy-${w}-step5.png`);
  const after = await sample();
  console.log(w, "present after +5:", after.filter((c) => c.present === "true").length, "of", after.length);

  // Keyboard: ArrowUp from +5 lands at once.
  await page.locator("#entropy .commit").nth(5).focus();
  await page.keyboard.press("ArrowUp");
  await frames(page, 1);
  const k = await sample();
  console.log(w, "keyboard ArrowUp: inline opacity on", k.filter((c) => c.opacity !== "").length, "chains; present", k.filter((c) => c.present === "true").length);
  // Rapid input: click +1, +5, +2 quickly; must settle without stacking.
  await page.locator("#entropy .commit").nth(1).click();
  await page.locator("#entropy .commit").nth(5).click();
  await page.locator("#entropy .commit").nth(2).click();
  const r0 = Date.now();
  let rapid = null;
  for (let i = 0; i < 60; i++) {
    const s = await sample();
    if (s.every((c) => c.opacity === "")) {
      rapid = Date.now() - r0;
      break;
    }
    await page.waitForTimeout(20);
  }
  const final = await sample();
  console.log(w, "rapid +1,+5,+2 settled after", rapid, "ms; present", final.filter((c) => c.present === "true").length);
  const restOk = await page.$$eval("#entropy .chain path", (ps) => ps.every((p) => !/Q.*Q/.test(p.getAttribute("d"))));
  console.log(w, "messages", messages);
  await context.close();
}
await browser.close();
