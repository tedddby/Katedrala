// Robustness checks for the cinematic film. Prints one JSON report.
// usage: node robust.mjs [check ...]   checks: modes keys rotate idle unmount longpage cls a11y
import { chromium } from "playwright-core";
const URL = "http://localhost:3100/lab/cinematic/";
const want = new Set(process.argv.slice(2));
const all = want.size === 0;
const report = {};
const WEBGL_ARGS = ["--use-angle=d3d11"];

// Counts rAF callbacks and records every WebGL context made (to check they are released).
const INSTRUMENT = () => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__rafCount = 0;
  window.requestAnimationFrame = (cb) => {
    window.__rafCount++;
    return raf(cb);
  };
  window.__contexts = [];
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = getContext.call(this, type, ...rest);
    if (ctx && /webgl/.test(type) && !window.__contexts.includes(ctx)) window.__contexts.push(ctx);
    return ctx;
  };
};

async function open(browser, { width = 1440, height = 900, reduced = false, mobile = width < 600 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: mobile ? 3 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.addInitScript(INSTRUMENT);
  await page.goto(URL, { waitUntil: "load" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  return { context, page, errors, requests };
}

const progressTo = (page, p) =>
  page.evaluate((p) => {
    const track = document.querySelector("[data-film-track]");
    const top = track.getBoundingClientRect().top + window.scrollY;
    const span = Math.max(0, track.offsetHeight - window.innerHeight);
    window.scrollTo({ top: top + p * span, behavior: "instant" });
  }, p);

const progress = (page) =>
  page.evaluate(() => {
    const track = document.querySelector("[data-film-track]");
    const r = track.getBoundingClientRect();
    return +(-r.top / (r.height - innerHeight)).toFixed(4);
  });

const browser = await chromium.launch({ channel: "msedge", headless: true, args: WEBGL_ARGS });

// 1. Modes: film, reduced motion, no WebGL. Which chunks each loads, what the title block says.
if (all || want.has("modes")) {
  const out = {};
  for (const [name, opts, args] of [
    ["film", {}, WEBGL_ARGS],
    ["reduced", { reduced: true }, WEBGL_ARGS],
    ["nowebgl", {}, ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"]],
  ]) {
    const b = await chromium.launch({ channel: "msedge", headless: true, args });
    const { page, errors, requests } = await open(b, opts);
    await page.waitForSelector("canvas[data-ready]", { timeout: 30000 }).catch(() => errors.push("never ready"));
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => ({
      mode: document.documentElement.dataset.kfilm,
      note: !document.querySelector("[data-film-fallback]").hidden,
      trackHeight: document.querySelector("[data-film-track]").offsetHeight,
      contexts: window.__contexts.length,
      first: Math.round(performance.getEntriesByName("kfilm:first-frame")[0]?.startTime ?? -1),
    }));
    const chunks = requests.filter((u) => /_next\/static\/chunks/.test(u)).map((u) => u.split("/").pop());
    out[name] = {
      ...state,
      three: requests.some((u) => /three|stage/i.test(u)),
      gsap: requests.some((u) => /gsap|ScrollTrigger/i.test(u)),
      chunkCount: chunks.length,
      errors,
    };
    await b.close();
  }
  report.modes = out;
}

// 2. Keyboard: Space and Page Down step through the beats; Escape clears a trace; Skip the film.
if (all || want.has("keys")) {
  const { page, errors } = await open(browser);
  await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
  await page.waitForTimeout(800);
  const stops = [];
  for (let i = 0; i < 13; i++) {
    await page.keyboard.press(i % 2 === 0 ? "Space" : "PageDown");
    await page.waitForTimeout(1100);
    stops.push(await progress(page));
  }
  const back = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("PageUp");
    await page.waitForTimeout(1100);
    back.push(await progress(page));
  }
  // Skip the film: from the top, Tab to the skip link and follow it.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(400);
  await page.evaluate(() => document.activeElement?.blur());
  const tabs = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    tabs.push(
      await page.evaluate(() => {
        const a = document.activeElement;
        const r = a.getBoundingClientRect();
        return `${a.textContent.trim().slice(0, 24)} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}]`;
      }),
    );
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.locator("a", { hasText: "Skip the film" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const skipped = await page.evaluate(() => {
    const track = document.querySelector("[data-film-track]");
    return {
      trackBottom: Math.round(track.getBoundingClientRect().bottom),
      focused: document.activeElement?.id ?? document.activeElement?.tagName,
      navUnder: document.documentElement.dataset.kfilmUnder !== undefined,
    };
  });
  report.keys = { stops, back, tabs, skipped, errors };
  await page.context().close();
}

// 3. Rotation: a phone turned to landscape after the turn, and back, mid-film.
if (all || want.has("rotate")) {
  const { page, errors } = await open(browser, { width: 390, height: 844 });
  await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
  await page.waitForTimeout(800);
  await progressTo(page, 0.8);
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => ({ framing: window.__kfilm.framing, p: +window.__kfilm.p.toFixed(3) }));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(1500);
  const landscape = await page.evaluate(() => ({ framing: window.__kfilm.framing, p: +window.__kfilm.p.toFixed(3) }));
  await page.screenshot({ path: "rotate-landscape.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  const portrait = await page.evaluate(() => ({ framing: window.__kfilm.framing, p: +window.__kfilm.p.toFixed(3) }));
  await page.screenshot({ path: "rotate-portrait.png" });
  report.rotate = { before, landscape, portrait, errors };
  await page.context().close();
}

// 4. Idle: no frames at rest (hero, after the opening), none when scrolled past the film or in a hidden tab.
if (all || want.has("idle")) {
  const { page, errors } = await open(browser);
  await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
  await page.waitForTimeout(5000);
  const count = async (ms) => {
    const a = await page.evaluate(() => window.__rafCount);
    await page.waitForTimeout(ms);
    return (await page.evaluate(() => window.__rafCount)) - a;
  };
  const atHero = await count(2000);
  await progressTo(page, 0.35);
  await page.waitForTimeout(1500);
  const hanging = await count(2000);
  await page.waitForTimeout(16000);
  const hangingCalm = await count(2000);
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await page.waitForTimeout(1000);
  const pastFilm = await count(2000);
  report.idle = { atHero, hanging, hangingCalm, pastFilm, errors };
  await page.context().close();
}

// 5. Unmount: a client-side navigation away releases the context, the loop and the attributes on <html>.
if (all || want.has("unmount")) {
  const { page, errors } = await open(browser);
  await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
  await progressTo(page, 0.3);
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => ({ ...document.documentElement.dataset, contexts: window.__contexts.length }));
  const navigated = await page.evaluate(async () => {
    const router = window.next?.router;
    if (!router) return "no window.next.router";
    router.push("/");
    return "pushed";
  });
  await page.waitForTimeout(4000);
  const after = await page.evaluate(async () => {
    const a = window.__rafCount;
    await new Promise((r) => setTimeout(r, 1500));
    return {
      path: location.pathname,
      film: document.querySelector("[data-film-track]") !== null,
      dataset: { ...document.documentElement.dataset },
      contexts: window.__contexts.map((c) => (c.isContextLost() ? "lost" : "live")),
      rafPer1500ms: window.__rafCount - a,
      kfilm: window.__kfilm === undefined ? "gone" : "still referenced",
    };
  });
  report.unmount = { before, navigated, after, errors };
  await page.context().close();
}

// 6. As one section of a longer page: content before the film; the pin starts at the film's top.
if (all || want.has("longpage")) {
  const { page, errors } = await open(browser);
  await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.cssText = "height:1500px;background:#16191c";
    spacer.id = "spacer";
    document.querySelector("main").prepend(spacer);
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(1200);
  const probe = async (y) => {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
    await page.waitForTimeout(900);
    return page.evaluate(() => ({
      y: Math.round(scrollY),
      p: +window.__kfilm.p.toFixed(3),
      stickyTop: Math.round(document.querySelector("[data-film-stage]").getBoundingClientRect().top),
      under: document.documentElement.dataset.kfilmUnder !== undefined,
      hero: !document.querySelector("[data-film-hero]").hasAttribute("data-off"),
    }));
  };
  const rows = [];
  for (const y of [0, 1000, 1500, 2500, 6000]) rows.push(await probe(y));
  const end = await page.evaluate(() => {
    const t = document.querySelector("[data-film-track]");
    return Math.round(t.getBoundingClientRect().top + scrollY + t.offsetHeight);
  });
  rows.push(await probe(end - 900 + 200));
  report.longpage = { rows, errors };
  await page.context().close();
}

// 7. Layout shift over load and a full scroll of the film.
if (all || want.has("cls")) {
  const out = {};
  for (const [name, w, h] of [
    ["desktop", 1440, 900],
    ["phone", 390, 844],
  ]) {
    const { page, errors } = await open(browser, { width: w, height: h });
    await page.evaluate(() => {
      window.__cls = 0;
      window.__shifts = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue;
          window.__cls += e.value;
          window.__shifts.push([Math.round(e.startTime), +e.value.toFixed(4), (e.sources || []).map((s) => { const n = s.node; if (!n) return "?"; const el = n.nodeType === 1 ? n : n.parentElement; return `${n.nodeName} in ${el?.tagName}.${(el?.className?.toString?.() || "").slice(0, 30)} [${[...(el?.attributes || [])].map((a) => a.name).join(",")}] ${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)}`; })]);
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
    await page.waitForTimeout(2000);
    for (let p = 0; p <= 1.001; p += 0.02) {
      await progressTo(page, Math.min(1, p));
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(800);
    out[name] = { ...(await page.evaluate(() => ({ cls: +window.__cls.toFixed(4), shifts: window.__shifts.slice(0, 8) }))), errors };
    await page.context().close();
  }
  report.cls = out;
}

// 8. The text alternative: what assistive technology reads from the section, wherever the film is.
if (all || want.has("a11y")) {
  const { page, errors } = await open(browser);
  await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
  await progressTo(page, 0.5);
  await page.waitForTimeout(1500);
  const snapshot = await page.locator("section#top").ariaSnapshot();
  report.a11y = { snapshot, errors };
  await page.context().close();
}

await browser.close();
console.log(JSON.stringify(report, null, 1));

