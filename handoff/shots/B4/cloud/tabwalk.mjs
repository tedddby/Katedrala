// Tab walk through my plates: each stop's element, its name, whether a focus indication shows (an outline or the
// drawing's ring), whether it sits under the fixed header, and whether it is in the viewport.
import { VIEWPORTS, launch, open } from "./lib.mjs";
const w = process.argv[2] ?? "1440";
const browser = await launch();
const { page, context } = await open(browser, VIEWPORTS[w]);
// Start just before the explorer: focus the last focusable element before #architecture.
await page.evaluate(() => {
  const all = [...document.querySelectorAll('a[href], button, [tabindex="0"], summary, select, input')].filter((e) => e.getClientRects().length && e.tabIndex >= 0);
  const arch = document.querySelector("#architecture");
  const before = all.filter((e) => arch.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_PRECEDING);
  before.at(-1).focus();
});
const stops = [];
for (let i = 0; i < 90; i++) {
  await page.keyboard.press("Tab");
  await page.waitForTimeout(650);
  const s = await page.evaluate(() => {
    const el = document.activeElement;
    const sec = el.closest("main > section[id]")?.id ?? "(outside)";
    const r = el.getBoundingClientRect();
    const header = document.querySelector("body > header");
    const hb = header ? header.getBoundingClientRect().bottom : 0;
    const cs = getComputedStyle(el);
    const ring = el.querySelector?.(".plan-ring, .drawing-focus");
    const ringStroke = ring ? getComputedStyle(ring).stroke : "";
    const visible = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2) || (ringStroke && ringStroke !== "none" && ringStroke !== "transparent" && !ringStroke.includes("0, 0, 0, 0"));
    return { sec, tag: el.tagName.toLowerCase(), name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60), visible, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, under: r.top < hb && r.bottom > 0, inView: r.bottom > 0 && r.top < innerHeight };
  });
  if (s.sec === "evidence" || s.sec === "history") break;
  if (!["architecture", "gravity", "entropy", "rules"].includes(s.sec)) continue;
  stops.push(s);
}
for (const [i, s] of stops.entries()) console.log(w, i + 1, s.sec, s.tag, JSON.stringify(s.name), s.visible ? "ring" : "NO-RING " + s.outline, s.under ? "UNDER-HEADER" : "", s.inView ? "" : "OFFSCREEN");
console.log(w, "stops", stops.length, "problems", stops.filter((s) => !s.visible || s.under || !s.inView).length);
await context.close(); await browser.close();
