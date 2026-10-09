// The keyboard walk through the film with the acts' real controls: from the hero's last action, Tab through every
// control in the film until focus leaves it, then Shift+Tab back to the hero. Each stop: the element, where the film
// is, on screen, clear of the bar, painted on top (not covered by a film layer), opacity, ring.
// usage: node walk.mjs [W]x[H]
import { chromium } from "playwright-core";
const [size = "1440x900"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const mobile = width < 600;
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
await page.waitForTimeout(2500);
const describe = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    const film = window.__kfilm;
    const pos = film?.pos ? `${film.pos.id} ${film.pos.t.toFixed(3)}` : null;
    if (!el || el === document.body) return { el: "body", pos };
    const r = el.getBoundingClientRect();
    let opacity = 1;
    let hidden = false;
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      opacity *= Number(cs.opacity);
      if (cs.visibility === "hidden" || cs.display === "none") hidden = true;
    }
    const nav = document.querySelector(".site-nav");
    const navBottom = nav ? nav.getBoundingClientRect().bottom : 0;
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + Math.min(r.width / 2, 12)));
    const cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(cx, cy);
    const inFilm = !!el.closest("[data-film-track]");
    return {
      el: `${el.tagName.toLowerCase()}${el.getAttribute("role") ? "[" + el.getAttribute("role") + "]" : ""} ${(el.getAttribute("aria-label") || el.textContent || el.value || "").trim().replace(/\s+/g, " ").slice(0, 40)}`,
      inFilm,
      pos,
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      onScreen: r.bottom > 0 && r.top < innerHeight && r.width > 2 && r.height > 2 && r.left < innerWidth && r.right > 0,
      clearOfBar: el.closest(".site-nav") !== null || r.top >= navBottom - 1,
      onTop: hit === el || el.contains(hit) || (hit && hit.closest("label") && hit.closest("label").contains(el)) || false,
      hit: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 30)}` : null,
      opacity: +opacity.toFixed(2),
      hidden,
      ring: getComputedStyle(el).outlineStyle !== "none" ? getComputedStyle(el).outlineWidth + " " + getComputedStyle(el).outlineColor : "none",
    };
  });
const log = [];
await page.getByRole("link", { name: "View on GitHub" }).first().focus();
await page.waitForTimeout(400);
log.push({ step: "start", ...(await describe()) });
let left = false;
for (let i = 0; i < 30 && !left; i++) {
  await page.keyboard.press("Tab");
  await page.waitForTimeout(500);
  const d = await describe();
  log.push({ step: `Tab ${i + 1}`, ...d });
  if (!d.inFilm && d.el !== "body" && i > 0) left = true;
}
for (let i = 0; i < 30; i++) {
  await page.keyboard.press("Shift+Tab");
  await page.waitForTimeout(500);
  const d = await describe();
  log.push({ step: `Shift+Tab ${i + 1}`, ...d });
  if (d.el.includes("View on GitHub")) break;
}
for (const l of log) console.log(JSON.stringify(l));
const bad = log.filter((l) => l.el !== "body" && (!l.onScreen || !l.clearOfBar || l.opacity < 0.99 || l.hidden || !l.onTop || l.ring === "none"));
console.log("PROBLEMS:", bad.length);
for (const b of bad) console.log("  ", JSON.stringify(b));
await browser.close();
