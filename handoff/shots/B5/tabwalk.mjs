// Tab walk through B5's sections: from the last focusable element before #history to the first after #ecosystem.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
for (const [width, height, phone] of [[1440, 900, false], [390, 844, true]]) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 120)));
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // Start just before History: focus a temporary stop at the end of the section before it.
  await page.evaluate(() => {
    const prev = document.querySelector("#history").previousElementSibling;
    const start = document.createElement("button"); start.id = "b5-start"; start.textContent = "start"; prev.appendChild(start); start.focus();
  });
  const stops = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    await page.evaluate(() => new Promise((done) => { let last = scrollY, still = 0; const t0 = performance.now(); const tick = () => { if (Math.abs(scrollY - last) < 0.5) still++; else { still = 0; last = scrollY; } if (still >= 12 || performance.now() - t0 > 4000) done(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
    const s = await page.evaluate(() => {
      const el = document.activeElement;
      const unit = el.closest("main > section[id]")?.id ?? el.closest("footer") ? "footer" : "?";
      const r = el.getBoundingClientRect();
      const header = document.querySelector("body > header")?.getBoundingClientRect().bottom ?? 0;
      const cs = getComputedStyle(el);
      return {
        unit: el.closest("main > section[id]")?.id ?? (el.closest("footer") ? "footer" : "?"),
        what: `${el.getAttribute("role") ?? el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}"`,
        ring: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
        scrollY: Math.round(scrollY), top: Math.round(r.top), visible: r.bottom > header && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
        underHeader: r.top < header,
      };
    });
    if (!["history", "developers", "open-source", "ecosystem"].includes(s.unit)) { if (stops.length) break; else continue; }
    stops.push(s);
  }
  console.log(`${width}: ${stops.length} stops`);
  for (const s of stops) console.log(`  ${s.unit.padEnd(12)} ${s.what.padEnd(50)} ring ${s.ring}${s.visible ? "" : ` NOT VISIBLE (top ${s.top}, scrollY ${s.scrollY})`}${s.underHeader ? " UNDER HEADER" : ""}`);
  if (errors.length) console.log("  console:", errors.join(" | "));
  await context.close();
}
await browser.close();
