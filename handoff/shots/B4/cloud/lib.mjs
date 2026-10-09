// Shared helpers for B4's checks: open the dev server page at a viewport, capture a section by stitching
// viewport screenshots (never beyond the viewport, which drops touch emulation in this Playwright and Edge).
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";

export const URL_ = process.env.URL_ ?? "http://localhost:3100/";
export const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });

export const VIEWPORTS = {
  1440: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  1280: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  1024: { width: 1024, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  768: { width: 768, height: 1024, deviceScaleFactor: 1, isMobile: false, hasTouch: true },
  844: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  390: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  430: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  360: { width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  320: { width: 320, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

export async function launch() {
  return chromium.launch({ channel: "msedge", headless: true });
}

export async function open(browser, vp, { reducedMotion = "no-preference", url = URL_ } = {}) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    reducedMotion,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const messages = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") messages.push(`${m.type()}: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => messages.push(`pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  // The dev server hydrates after the network goes idle: wait until the drawings have measured themselves.
  await page.waitForFunction(() => { const l = document.querySelector("#gravity .drawing .drawing-level-label"); const e = document.querySelector("#architecture .explorer-sheet > svg"); return (!l || l.getClientRects().length === 0 || l.style.fontSize !== "11px" || innerWidth >= 1440) && (!e || getComputedStyle(e).getPropertyValue("--member-unit") !== ""); }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  return { context, page, messages };
}

export async function frames(page, n = 2) {
  await page.evaluate(
    (count) =>
      new Promise((done) => {
        let i = 0;
        const step = () => (++i >= count ? done() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    n,
  );
}

/** Scrolls so the element's top sits `offset` px below the viewport top (instantly). */
export async function scrollTo(page, selector, offset = 80) {
  await page.evaluate(
    ({ selector, offset }) => {
      const el = document.querySelector(selector);
      const top = el.getBoundingClientRect().top + scrollY - offset;
      window.scrollTo({ top, behavior: "instant" });
    },
    { selector, offset },
  );
  await frames(page, 3);
}

/** Captures a document box (CSS px) by stitching viewport captures. */
export async function captureBox(page, vp, box, path, { hideHeader = true } = {}) {
  const left = Math.max(0, Math.floor(box.left));
  const width = Math.min(vp.width - left, Math.ceil(box.width));
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const height = Math.min(Math.ceil(box.height), docHeight - Math.round(box.top));
  const s = vp.deviceScaleFactor;
  const out = new PNG({ width: width * s, height: height * s });
  let style = null;
  if (hideHeader) style = await page.addStyleTag({ content: "body > header, body > a.skip-link { visibility: hidden !important; }" });
  let done = 0;
  while (done < height) {
    const want = Math.round(box.top) + done;
    const target = Math.max(0, Math.min(want, docHeight - vp.height));
    await page.evaluate((t) => window.scrollTo({ top: t, behavior: "instant" }), target);
    await frames(page, 2);
    await page.waitForTimeout(120);
    const actual = await page.evaluate(() => Math.round(window.scrollY));
    const inView = want - actual;
    const rows = Math.min(vp.height - inView, height - done);
    const buffer = await page.screenshot({ clip: { x: left, y: inView, width, height: rows }, scale: "device" });
    const part = PNG.sync.read(buffer);
    PNG.bitblt(part, out, 0, 0, Math.min(part.width, width * s), Math.min(part.height, rows * s), 0, done * s);
    done += rows;
  }
  if (style) await style.evaluate((n) => n.remove());
  const { writeFileSync } = await import("node:fs");
  writeFileSync(path, PNG.sync.write(out));
}

/** The document box of an element. */
export async function boxOf(page, selector) {
  return page.evaluate((selector) => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height };
  }, selector);
}

export async function captureSection(page, vp, id, path, pad = 0) {
  const box = await boxOf(page, `#${id}`);
  await captureBox(page, vp, { left: 0, top: box.top - pad, width: vp.width, height: box.height + pad }, path);
}
