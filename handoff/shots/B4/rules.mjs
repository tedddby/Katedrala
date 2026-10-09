// Rules: captures at several widths, the toggle (pointer and keyboard), the leader, label sizes, overflow.
import { OUT, VIEWPORTS, launch, open, scrollTo, captureSection, frames } from "./lib.mjs";
import { installTimer, measure } from "./timing.mjs";

const browser = await launch();
const widths = (process.argv[2] ?? "1440,1280,1024,768,390,320").split(",");
for (const w of widths) {
  const vp = VIEWPORTS[w] ?? { width: Number(w), height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
  const { page, messages, context } = await open(browser, vp);
  await scrollTo(page, "#rules", 0);
  await page.waitForTimeout(500);
  await captureSection(page, vp, "rules", `${OUT}rules-${w}-added.png`);
  const info = await page.evaluate(() => {
    const root = document.querySelector("#rules");
    const texts = [...root.querySelectorAll(".violation-body svg text")].filter((t) => t.getClientRects().length);
    const sizes = texts.map((t) => {
      const r = t.getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(t).fontSize);
      const svg = t.ownerSVGElement;
      const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      return { text: t.textContent.slice(0, 24), px: +(fs * scale).toFixed(1) };
    });
    const leader = root.querySelector(".rules-leader path");
    const doc = document.documentElement;
    return {
      minLabel: Math.min(...sizes.map((s) => s.px)),
      maxLabel: Math.max(...sizes.map((s) => s.px)),
      sizes,
      leader: leader ? leader.getAttribute("d") : null,
      overflow: doc.scrollWidth - doc.clientWidth,
      figure: (() => {
        const r = root.querySelector("figure.violation").getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
      })(),
      portrait: (() => {
        const s = root.querySelector(".violation-portrait");
        return s.getClientRects().length ? Math.round(s.getBoundingClientRect().width) : 0;
      })(),
      status: root.querySelector('[role="status"].data')?.textContent,
    };
  });
  console.log(w, JSON.stringify({ ...info, sizes: undefined }));

  // Pointer toggle: remove, then add back; measure chain time.
  await installTimer(page, "#rules");
  const toggle = page.locator("#rules .rules-toggle");
  await toggle.scrollIntoViewIfNeeded();
  const off = await measure(page, () => toggle.click());
  const removed = await page.evaluate(() => ({
    label: document.querySelector("#rules .rules-toggle").textContent,
    status: document.querySelector('#rules [role="status"].data').textContent,
    report: document.querySelector("#rules .violation-report").innerText.replace(/\s+/g, " "),
    img: document.querySelector("#rules .violation-body").getAttribute("aria-label"),
    marked: document.querySelectorAll("#rules [data-marked]").length,
  }));
  console.log(w, "removed", off, JSON.stringify(removed));
  await scrollTo(page, "#rules", 0);
  await page.waitForTimeout(300);
  await captureSection(page, vp, "rules", `${OUT}rules-${w}-removed.png`);
  await toggle.scrollIntoViewIfNeeded();
  const on = await measure(page, () => toggle.click());
  console.log(w, "added again", on);
  // Keyboard: Enter on the toggle lands at once (no inline chain styles one frame later).
  await toggle.focus();
  await page.keyboard.press("Enter");
  await frames(page, 1);
  const k = await page.evaluate(() => ({
    inline: [...document.querySelectorAll("#rules .chain")].filter((g) => g.style.opacity !== "").length,
    present: document.querySelector("#rules .chain").dataset.present,
    leaderTransition: (() => {
      const p = document.querySelector("#rules .rules-leader path");
      return p ? getComputedStyle(p).transitionDuration : null;
    })(),
  }));
  console.log(w, "keyboard Enter", JSON.stringify(k));
  await page.keyboard.press("Enter");
  await frames(page, 2);
  console.log(w, "messages", messages);
  await context.close();
}
await browser.close();
