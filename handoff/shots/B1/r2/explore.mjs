// "Explore Katedrala" by mouse and by keyboard: where the film lands, whether the hero is still shown over the beat,
// what holds focus. usage: node explore.mjs [W]x[H] [--reduced]
import { chromium } from "playwright-core";
const [size = "1440x900", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const reduced = rest.includes("--reduced");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const mobile = width < 600;
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: reduced ? "reduce" : "no-preference" });
const state = (page) =>
  page.evaluate(() => {
    const hero = document.querySelector("[data-film-hero]");
    const a = document.activeElement;
    const k = window.__kfilm;
    const cap = [...document.querySelectorAll("[data-caption][data-on]")].map((c) => c.dataset.caption);
    return {
      scrollY: Math.round(scrollY),
      anchor: Math.round(document.getElementById("film-start").getBoundingClientRect().top),
      heroOpacity: getComputedStyle(hero).opacity,
      heroOff: hero.hasAttribute("data-off"),
      active: a === document.body ? "body" : `${a.tagName} ${a.textContent.trim().slice(0, 30)}`,
      focusVisible: a !== document.body && a.matches(":focus-visible"),
      pos: k?.pos ? `${k.pos.id} ${k.pos.t.toFixed(3)}` : null,
      captions: cap,
      hash: location.hash,
    };
  });
for (const how of ["mouse", "keyboard"]) {
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.kfilmReady && (window.__kfilm?.trigger || document.documentElement.dataset.kfilm === "still"), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const link = page.getByRole("link", { name: "Explore Katedrala" });
  if (how === "mouse") {
    if (mobile) await link.tap(); else await link.click();
  } else {
    await link.focus();
    await page.keyboard.press("Enter");
  }
  const t0 = Date.now();
  const samples = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(150);
    samples.push({ ms: Date.now() - t0, ...(await state(page)) });
  }
  await page.waitForTimeout(1200);
  samples.push({ ms: Date.now() - t0, ...(await state(page)) });
  console.log(how, JSON.stringify(samples, null, 0));
  await page.screenshot({ path: `cap/explore-${how}-${size}${reduced ? "-reduced" : ""}.png` });
  // Next Tab: where does it go?
  await page.keyboard.press("Tab");
  await page.waitForTimeout(400);
  console.log(how, "next Tab:", JSON.stringify(await state(page)));
  await page.keyboard.press("Shift+Tab");
  await page.waitForTimeout(400);
  console.log(how, "then Shift+Tab:", JSON.stringify(await state(page)));
  await page.close();
}
await browser.close();
