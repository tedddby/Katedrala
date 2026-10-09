// Focus reveal and the keyboard walk. A test control is injected into the landing's block (the acts' controls are
// their builder's), then: Tab from the top with the film part-way through Act I; Tab from the hero actions into the
// film; Shift+Tab back; Shift+Tab from below the film into it. For every focused element: what it is, where the film
// is, whether it is on screen, clear of the bar, opaque, and its outline.
// usage: node focus.mjs [W]x[H] [--inject none|landing|evidence]
import { chromium } from "playwright-core";
const [size = "1440x900", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const inject = rest.includes("--inject") ? rest[rest.indexOf("--inject") + 1] : "trace";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const mobile = width < 600;
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
await page.waitForTimeout(2500);
if (inject !== "none") {
  await page.evaluate((act) => {
    const slot = document.querySelector(`[data-act-slot="${act}"]`);
    const b = document.createElement("button");
    b.textContent = `Test control in ${act}`;
    b.className = "button";
    b.setAttribute("data-test-control", "");
    // Placed where the act's block shows it: the landing's block is pinned over the frame for its whole act.
    b.style.cssText = "position:absolute;left:3rem;bottom:8rem;pointer-events:auto;padding:0.75rem 1rem;background:#e9e6df;color:#0e1012";
    slot.style.position ||= "";
    slot.append(b);
  }, inject);
}
const describe = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    const film = window.__kfilm;
    const pos = film?.pos ? `${film.pos.id} ${film.pos.t.toFixed(3)}` : null;
    if (!el || el === document.body) return { el: "body", pos, y: Math.round(scrollY) };
    const r = el.getBoundingClientRect();
    let opacity = 1;
    for (let n = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
    const nav = document.querySelector(".site-nav");
    const navBottom = nav ? nav.getBoundingClientRect().bottom : 0;
    // What is painted at the element's centre (obscured by the bar or a film layer?).
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
    const cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(cx, cy);
    return {
      el: `${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 34)}`,
      pos,
      y: Math.round(scrollY),
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      onScreen: r.bottom > 0 && r.top < innerHeight && r.width > 2 && r.height > 2,
      clearOfBar: el.closest(".site-nav") !== null || r.top >= navBottom,
      opacity: +opacity.toFixed(2),
      hitSelf: hit === el || el.contains(hit),
      ring: getComputedStyle(el).outlineStyle === "solid" ? getComputedStyle(el).outlineWidth + " " + getComputedStyle(el).outlineColor : "none",
      instant: document.querySelector("[data-instant]") !== null,
    };
  });
const log = [];
const step = async (key, label) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(450);
  const d = await describe();
  log.push({ step: label ?? key, ...d });
};
// 1. From the top of the document with the film part-way through Act I.
await page.evaluate(() => {
  const film = window.__kfilm;
  const tr = film.trigger;
  window.scrollTo({ top: tr.start + film.clock.progressOf(0, 0.5) * (tr.end - tr.start), behavior: "instant" });
  document.activeElement?.blur();
});
await page.waitForTimeout(1200);
log.push({ step: "start (Act I t 0.5)", ...(await describe()) });
for (let i = 0; i < 12; i++) {
  await step("Tab");
  const last = log[log.length - 1];
  if (last.el.includes("Test control") || last.el.startsWith("summary")) break;
}
await step("Shift+Tab", "Shift+Tab back");
await step("Shift+Tab", "Shift+Tab again");
// 2. From below the film (the preview route ends with it: a section with a link is added after it, as the page has),
// Shift+Tab into it.
await page.evaluate(() => {
  document.activeElement?.blur();
  const section = document.createElement("section");
  section.style.cssText = "height:1200px;padding:6rem 3rem";
  const a = document.createElement("a");
  a.href = "#how-it-works";
  a.textContent = "A link in the section after the film";
  section.append(a);
  document.querySelector("main").append(section);
  a.focus({ preventScroll: false });
});
await page.waitForTimeout(800);
log.push({ step: "focus below the film", ...(await describe()) });
await step("Shift+Tab", "Shift+Tab into the film");
await step("Shift+Tab", "Shift+Tab to the hero");
for (const l of log) console.log(JSON.stringify(l));
await page.screenshot({ path: `cap/focus-last-${size}.png` });
await browser.close();
