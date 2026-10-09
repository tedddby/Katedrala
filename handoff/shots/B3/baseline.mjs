// Records the main page, unit by unit, so later states can be diffed against it (plan 4.4 item 1, gate GB).
// Units: the skip link(s), the header, every `main > section[id]` in DOM order, and the footer.
// Per viewport (1440x900 desktop; 390x844 phone: touch, DPR 2) and per unit:
//   <unit>.txt            innerText
//   <unit>.aria.yml       Playwright ariaSnapshot of the unit's element
//   <unit>.controls.json  every control in the unit from Chromium's accessibility tree: computed role, name,
//                         value, description, states, and its element (tag, tab index, ARIA attributes, page box)
//   <unit>.controls.txt   the same, one line per control, without geometry (for text diffs)
//   <unit>.png            the unit's box (fixed chrome hidden for sections and footer)
// Per viewport: first-viewport.png, full-page.png, page.txt, page.aria.yml, page.json (title, meta, headings,
// landmarks, media features before and after the screenshots), geometry.json, nav-states.json, header.png,
// header-scrolled.png, tab-order.json/.txt (a real Tab walk with the computed role and name of every stop),
// skip-link-focused.png, console.txt; on the phone also menu-open.* and menu-behavior.json.
//
// Every screenshot is a viewport capture (tall boxes are stitched while scrolling): in this Playwright and Edge, a
// capture beyond the viewport silently drops touch emulation for the rest of the page's life, which turns the
// phone's coarse-pointer layout (44 px targets) into the desktop one.
//
// Usage: node baseline.mjs <outDir> [--url=http://localhost:3100/] [--only=1440,390]
// Diff two records: diff -ru -x '*.png' -x '*.json' <before>/1440 <after>/1440
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";

const args = process.argv.slice(2);
const outRoot = resolve(args.find((a) => !a.startsWith("--")) ?? "./record");
const option = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const URL_ = option("url", "http://localhost:3100/");
const ONLY = option("only", "");
const VIEWPORTS = [
  { tag: "1440", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { tag: "390", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
].filter((v) => !ONLY || ONLY.split(",").includes(v.tag));

const UNIT_SELECTOR = "main > section[id], body > header, body > footer, body > a.skip-link";
const unitSelectorFor = (unit) =>
  unit === "header" ? "body > header" : unit === "footer" ? "body > footer" : unit === "skip-link" ? "body > a.skip-link" : `main > section#${unit}`;
const WIDGET_ROLES = new Set([
  "button", "link", "checkbox", "radio", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option",
  "combobox", "listbox", "textbox", "searchbox", "slider", "spinbutton", "switch", "treeitem", "DisclosureTriangle",
  "radiogroup", "tablist", "tabpanel", "toolbar", "menu", "menubar", "grid", "tree", "treegrid", "application",
  "scrollbar", "MenuListOption", "ListBoxOption", "PopUpButton", "ToggleButton",
]);
// States worth diffing; volatile ones (focused, editable, settable) stay in the JSON only.
const LINE_STATES = [
  "checked", "pressed", "selected", "expanded", "disabled", "hasPopup", "invalid", "required", "readonly", "level",
  "orientation", "multiselectable", "valuetext", "valuemin", "valuemax", "roledescription", "live", "atomic",
  "modal", "busy", "controls", "describedby", "activedescendant", "keyshortcuts",
];

const normalizeIds = (s) => String(s).replace(/_R_[0-9a-zA-Z]+_/g, "«id»");
const origin = new URL(URL_).origin;
const stripOrigin = (s) => (typeof s === "string" && s.startsWith(origin) ? s.slice(origin.length) : s);

// Runs on a resolved DOM node (this) through CDP.
const DOM_INFO = `function () {
  const el = this.nodeType === 1 ? this : this.parentElement;
  if (!el) return { unit: "(none)" };
  const u = el.closest(${JSON.stringify(UNIT_SELECTOR)});
  let unit = "(outside)";
  if (u) unit = u.matches("main > section[id]") ? u.id : u.matches("body > header") ? "header" : u.matches("body > footer") ? "footer" : "skip-link";
  const r = el.getBoundingClientRect();
  const attrs = {};
  for (const a of el.attributes) {
    if (a.name.startsWith("aria-") || ["role", "tabindex", "href", "type", "disabled", "hidden", "rel", "target", "name", "open"].includes(a.name)) {
      attrs[a.name] = a.value.length > 160 ? a.value.slice(0, 160) + "..." : a.value;
    }
  }
  return {
    unit,
    tag: el.tagName.toLowerCase(),
    tabIndex: el.tabIndex,
    attrs,
    rendered: el.getClientRects().length > 0,
    rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 },
  };
}`;

const ACTIVE_INFO = (selector) => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const u = el.closest(selector);
  let unit = "(outside)";
  if (u) unit = u.matches("main > section[id]") ? u.id : u.matches("body > header") ? "header" : u.matches("body > footer") ? "footer" : "skip-link";
  const r = el.getBoundingClientRect();
  const header = document.querySelector("body > header");
  const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
  const style = getComputedStyle(el);
  return {
    unit,
    tag: el.tagName.toLowerCase(),
    text: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 100),
    tabIndex: el.tabIndex,
    focusVisible: el.matches(":focus-visible"),
    outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
    rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    scrollY: Math.round(scrollY),
    inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
    underHeader: unit !== "header" && unit !== "skip-link" && r.top < headerBottom && r.bottom > 0,
  };
};

const MEDIA = () => {
  const media = {};
  for (const q of ["(pointer: coarse)", "(pointer: fine)", "(any-pointer: coarse)", "(hover: hover)", "(hover: none)", "(prefers-reduced-motion: reduce)", "(prefers-color-scheme: dark)"]) {
    media[q] = matchMedia(q).matches;
  }
  return { media, scrollHeight: document.documentElement.scrollHeight, clientWidth: document.documentElement.clientWidth };
};

const report = [];
const log = (line) => {
  report.push(line);
  console.log(line);
};
const writeText = (file, text) => writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`);
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

async function frames(page, n = 2) {
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

/** Waits until the scroll position has not moved for 10 frames (smooth scrolling), at most maxMs. */
async function settleScroll(page, maxMs = 2500) {
  await page.evaluate(
    (max) =>
      new Promise((done) => {
        const start = performance.now();
        let last = scrollY;
        let still = 0;
        const tick = () => {
          if (Math.abs(scrollY - last) < 0.5) still += 1;
          else {
            still = 0;
            last = scrollY;
          }
          if (still >= 10 || performance.now() - start > max) done();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    maxMs,
  );
}

async function open(context) {
  const page = await context.newPage();
  const messages = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") messages.push(`${m.type()}: ${m.text().slice(0, 400)}`);
  });
  page.on("pageerror", (e) => messages.push(`pageerror: ${e.message}`));
  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return { page, messages };
}

/**
 * Captures a box of the document (CSS px) by scrolling it through the viewport and stitching viewport captures,
 * never capturing beyond the viewport. `deviceScale` keeps device pixels (crisper); otherwise one pixel per CSS px.
 */
async function captureRange(page, vp, box, path, { deviceScale = false, hideChromeAfterFirst = false } = {}) {
  const s = deviceScale ? vp.deviceScaleFactor : 1;
  const left = Math.max(0, Math.floor(box.left));
  const width = Math.min(vp.width - left, Math.ceil(box.width));
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  // A box whose fractional bottom is the document's end must not ask for a row past it.
  const height = Math.min(Math.ceil(box.height), docHeight - Math.round(box.top));
  const out = new PNG({ width: width * s, height: height * s });
  let done = 0;
  let hide = null;
  while (done < height) {
    const want = Math.round(box.top) + done;
    const target = Math.max(0, Math.min(want, docHeight - vp.height));
    await page.evaluate((t) => window.scrollTo({ top: t, behavior: "instant" }), target);
    await frames(page, 2);
    await page.waitForTimeout(90);
    const actual = await page.evaluate(() => Math.round(window.scrollY));
    const inView = want - actual;
    if (inView < 0 || inView >= vp.height) throw new Error(`cannot bring document y ${want} into view (scrollY ${actual})`);
    const rows = Math.min(vp.height - inView, height - done);
    const buffer = await page.screenshot({ clip: { x: left, y: inView, width, height: rows }, scale: deviceScale ? "device" : "css" });
    const part = PNG.sync.read(buffer);
    PNG.bitblt(part, out, 0, 0, Math.min(part.width, width * s), Math.min(part.height, rows * s), 0, done * s);
    done += rows;
    if (hideChromeAfterFirst && hide === null) {
      hide = await page.addStyleTag({ content: "body > header, body > a.skip-link { visibility: hidden !important; }" });
    }
  }
  if (hide !== null) await hide.evaluate((node) => node.remove());
  writeFileSync(path, PNG.sync.write(out));
  return { width: width * s, height: height * s };
}

async function axControls(client) {
  const { nodes } = await client.send("Accessibility.getFullAXTree");
  const out = [];
  for (const n of nodes) {
    if (n.ignored || !n.backendDOMNodeId) continue;
    const role = n.role?.value ?? "";
    if (role === "RootWebArea" || role === "MenuListPopup") continue;
    const props = Object.fromEntries((n.properties ?? []).map((p) => [p.name, p.value]));
    const focusable = props.focusable?.value === true;
    if (!WIDGET_ROLES.has(role) && !focusable) continue;
    let dom;
    try {
      const { object } = await client.send("DOM.resolveNode", { backendNodeId: n.backendDOMNodeId });
      const { result } = await client.send("Runtime.callFunctionOn", {
        objectId: object.objectId,
        functionDeclaration: DOM_INFO,
        returnByValue: true,
      });
      dom = result.value;
      await client.send("Runtime.releaseObject", { objectId: object.objectId });
    } catch (error) {
      dom = { unit: "(unresolved)", error: String(error?.message ?? error) };
    }
    const states = {};
    for (const [key, v] of Object.entries(props)) {
      if (["idref", "idrefList", "node", "nodeList"].includes(v.type)) {
        states[key] = (v.relatedNodes ?? []).map((r) => (r.text ? r.text : r.idref ? `#${normalizeIds(r.idref)}` : "node"));
      } else {
        states[key] = key === "url" ? stripOrigin(v.value) : v.value;
      }
    }
    out.push({
      unit: dom?.unit ?? "(unknown)",
      role,
      name: n.name?.value ?? "",
      ...(n.description?.value ? { description: n.description.value } : {}),
      ...(n.value?.value !== undefined && n.value?.value !== "" ? { value: n.value.value } : {}),
      states,
      dom,
    });
  }
  return out;
}

function controlLine(c) {
  const parts = [`${c.role} "${c.name}"`];
  if (c.value !== undefined) parts.push(`value="${c.value}"`);
  if (c.description) parts.push(`description="${c.description}"`);
  for (const key of LINE_STATES) {
    const v = c.states[key];
    if (v === undefined || v === false || v === "false" || (Array.isArray(v) && v.length === 0)) continue;
    parts.push(Array.isArray(v) ? `${key}=[${v.map(normalizeIds).join(", ")}]` : v === true ? key : `${key}=${v}`);
  }
  if (c.states.url) parts.push(`url=${c.states.url}`);
  if (c.states.focusable) parts.push("focusable");
  const dom = c.dom ?? {};
  parts.push(`<${dom.tag ?? "?"}${dom.tabIndex !== undefined ? ` tabindex=${dom.tabIndex}` : ""}${dom.rendered === false ? " not-rendered" : ""}>`);
  return parts.join(" ");
}

async function boxOf(page, selector) {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height };
  });
}

async function captureViewport(browser, vp) {
  const dir = join(outRoot, vp.tag);
  mkdirSync(dir, { recursive: true });
  const contextOptions = {
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    reducedMotion: "no-preference",
    colorScheme: "dark",
  };
  const context = await browser.newContext(contextOptions);
  const { page, messages } = await open(context);
  const client = await context.newCDPSession(page);
  await client.send("DOM.enable");
  await client.send("Accessibility.enable");
  const mediaAtLoad = await page.evaluate(MEDIA);

  // First viewport, as a visitor lands.
  await page.waitForTimeout(1600);
  await page.screenshot({ path: join(dir, "first-viewport.png") });

  // Scroll through so every observer fires, then let the drawings settle.
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += Math.round(vp.height * 0.6)) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
    await page.waitForTimeout(110);
  }
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(500);

  // Page-level records.
  const units = await page.evaluate((selector) => {
    const out = [];
    for (const el of document.querySelectorAll(selector)) {
      out.push(el.matches("main > section[id]") ? el.id : el.matches("body > header") ? "header" : el.matches("body > footer") ? "footer" : "skip-link");
    }
    return out;
  }, UNIT_SELECTOR);
  const pageInfo = await page.evaluate(() => {
    const describe = (e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""}${e.classList.length ? `.${[...e.classList].join(".")}` : ""}`;
    return {
      title: document.title,
      lang: document.documentElement.lang,
      htmlAttributes: Object.fromEntries([...document.documentElement.attributes].filter((a) => a.name !== "class").map((a) => [a.name, a.value])),
      meta: Object.fromEntries([...document.querySelectorAll("meta[name], meta[property]")].map((m) => [m.getAttribute("name") ?? m.getAttribute("property"), m.getAttribute("content")])),
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      bodyChildren: [...document.body.children].filter((e) => e.tagName !== "SCRIPT").map(describe),
      mainChildren: [...(document.querySelector("main")?.children ?? [])].map(describe),
      headings: [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
        .filter((h) => h.getClientRects().length > 0)
        .map((h) => `${h.tagName.toLowerCase()} ${h.textContent.trim().replace(/\s+/g, " ")}`),
      landmarks: [...document.querySelectorAll("header, nav, main, footer, aside, section[aria-labelledby], section[aria-label], [role=region], [role=navigation], [role=banner], [role=contentinfo], [role=complementary], form[aria-label]")]
        .filter((e) => e.getClientRects().length > 0)
        .map((e) => `${e.getAttribute("role") ?? e.tagName.toLowerCase()} ${e.getAttribute("aria-label") ?? (e.getAttribute("aria-labelledby") ? document.getElementById(e.getAttribute("aria-labelledby"))?.textContent.trim() ?? "" : "")}`.trim()),
      skipLinks: [...document.querySelectorAll("a.skip-link")].map((a) => `${a.textContent.trim()} -> ${a.getAttribute("href")}`),
      firstBodyChild: document.body.firstElementChild?.outerHTML.slice(0, 300),
    };
  });
  pageInfo.units = units;
  pageInfo.mediaAtLoad = mediaAtLoad;
  writeText(join(dir, "page.txt"), await page.locator("body").evaluate((b) => b.innerText));
  writeText(join(dir, "page.aria.yml"), await page.locator("body").ariaSnapshot());

  const geometry = await page.evaluate(
    ({ selector, vh }) => {
      const rows = [];
      for (const el of document.querySelectorAll(selector)) {
        const key = el.matches("main > section[id]") ? el.id : el.matches("body > header") ? "header" : el.matches("body > footer") ? "footer" : "skip-link";
        const r = el.getBoundingClientRect();
        rows.push({ unit: key, top: Math.round(r.top + scrollY), height: Math.round(r.height), viewports: Math.round((r.height / vh) * 100) / 100 });
      }
      return { scrollHeight: document.documentElement.scrollHeight, viewportHeight: vh, documentViewports: Math.round((document.documentElement.scrollHeight / vh) * 100) / 100, units: rows };
    },
    { selector: UNIT_SELECTOR, vh: vp.height },
  );
  writeJson(join(dir, "geometry.json"), geometry);

  // Controls from the accessibility tree, split by unit; text and accessibility snapshot per unit.
  const controls = await axControls(client);
  writeJson(join(dir, "controls-all.json"), controls);
  const outside = controls.filter((c) => !units.includes(c.unit));
  if (outside.length) log(`[${vp.tag}] ${outside.length} controls outside every unit: ${outside.map((c) => `${c.role} "${c.name}" (${c.unit})`).join("; ")}`);
  for (const unit of units) {
    const locator = page.locator(unitSelectorFor(unit)).first();
    try {
      writeText(join(dir, `${unit}.txt`), await locator.evaluate((el) => el.innerText));
      writeText(join(dir, `${unit}.aria.yml`), await locator.ariaSnapshot());
      const mine = controls.filter((c) => c.unit === unit);
      writeJson(join(dir, `${unit}.controls.json`), mine);
      writeText(join(dir, `${unit}.controls.txt`), mine.map(controlLine).join("\n") || "(no controls)");
    } catch (error) {
      log(`[${vp.tag}] ${unit}: ${String(error?.message ?? error).split("\n")[0]}`);
    }
  }

  // Screenshots: the header over the top of the page, then every section and the footer with the chrome hidden.
  const hasHeader = units.includes("header");
  if (hasHeader) {
    const box = await boxOf(page, "body > header");
    await captureRange(page, vp, { ...box, top: 0 }, join(dir, "header.png"), { deviceScale: true });
  }
  const hideChrome = await page.addStyleTag({ content: "body > header, body > a.skip-link { visibility: hidden !important; }" });
  for (const unit of units) {
    if (unit === "header" || unit === "skip-link") continue;
    try {
      const box = await boxOf(page, unitSelectorFor(unit));
      // Let anything that starts when the box comes into view settle before the stitch.
      await page.evaluate((t) => window.scrollTo({ top: t, behavior: "instant" }), Math.max(0, box.top - 40));
      await page.waitForTimeout(400);
      await captureRange(page, vp, box, join(dir, `${unit}.png`), { deviceScale: true });
    } catch (error) {
      log(`[${vp.tag}] ${unit} screenshot: ${String(error?.message ?? error).split("\n")[0]}`);
    }
  }
  await hideChrome.evaluate((node) => node.remove());

  // The whole page from the top, the header showing only where it sits at load.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(300);
  const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const full = await captureRange(page, vp, { left: 0, top: 0, width: vp.width, height: fullHeight }, join(dir, "full-page.png"), { hideChromeAfterFirst: true });
  log(`[${vp.tag}] full page ${full.width}x${full.height}`);

  // Header once the page has scrolled (solid), and the navigation's background along the page.
  if (hasHeader) {
    await page.evaluate(() => window.scrollTo({ top: 1200, behavior: "instant" }));
    await frames(page, 3);
    await page.waitForTimeout(200);
    const box = await page.locator("body > header").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top + scrollY, width: r.width, height: r.height };
    });
    await captureRange(page, vp, box, join(dir, "header-scrolled.png"), { deviceScale: true });
    const positions = [0, 24, 48, 72, 96, 200, 900, Math.round(total / 2), total - vp.height];
    const navStates = [];
    for (const top of positions) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
      await frames(page, 3);
      navStates.push(
        await page.evaluate(() => {
          const h = document.querySelector("body > header");
          const cs = getComputedStyle(h);
          return { scrollY: Math.round(scrollY), backgroundColor: cs.backgroundColor, borderBottomColor: cs.borderBottomColor, height: Math.round(h.getBoundingClientRect().height) };
        }),
      );
    }
    writeJson(join(dir, "nav-states.json"), navStates);
  }
  pageInfo.mediaAfterScreenshots = await page.evaluate(MEDIA);
  writeJson(join(dir, "page.json"), pageInfo);
  if (JSON.stringify(pageInfo.mediaAfterScreenshots.media) !== JSON.stringify(mediaAtLoad.media)) log(`[${vp.tag}] WARNING: media features changed during capture`);
  if (pageInfo.mediaAfterScreenshots.scrollHeight !== mediaAtLoad.scrollHeight) log(`[${vp.tag}] note: scrollHeight ${mediaAtLoad.scrollHeight} at load, ${pageInfo.mediaAfterScreenshots.scrollHeight} after`);
  writeText(join(dir, "console.txt"), messages.join("\n") || "(no errors or warnings)");
  await page.close();

  // Keyboard: a real Tab walk from a fresh load, with the computed role and name of every stop.
  {
    const { page: walk, messages: walkMessages } = await open(context);
    const walkClient = await context.newCDPSession(walk);
    await walkClient.send("Accessibility.enable");
    await walk.waitForTimeout(1200);
    const stops = [];
    let previous = "";
    let repeats = 0;
    for (let i = 0; i < 600; i += 1) {
      await walk.keyboard.press("Tab");
      await settleScroll(walk);
      const info = await walk.evaluate(ACTIVE_INFO, UNIT_SELECTOR);
      if (info === null) break;
      let role = "";
      let name = "";
      try {
        const { result } = await walkClient.send("Runtime.evaluate", { expression: "document.activeElement" });
        const { nodes } = await walkClient.send("Accessibility.getPartialAXTree", { objectId: result.objectId, fetchRelatives: false });
        const node = nodes.find((n) => !n.ignored) ?? nodes[0];
        role = node?.role?.value ?? "";
        name = node?.name?.value ?? "";
        await walkClient.send("Runtime.releaseObject", { objectId: result.objectId });
      } catch {}
      if (i === 0 && info.unit === "skip-link") {
        await walk.screenshot({ path: join(dir, "skip-link-focused.png"), clip: { x: 0, y: 0, width: vp.width, height: 140 } });
      }
      const key = `${info.unit}|${role}|${name}|${info.rect.x},${info.rect.y + info.scrollY}`;
      if (stops.length > 0) {
        const first = stops[0];
        if (key === `${first.unit}|${first.role}|${first.name}|${first.rect.x},${first.rect.y + first.scrollY}`) break;
      }
      repeats = key === previous ? repeats + 1 : 0;
      previous = key;
      if (repeats >= 3) {
        log(`[${vp.tag}] Tab walk stuck at ${key}`);
        break;
      }
      stops.push({ index: stops.length + 1, role, name, ...info });
    }
    writeJson(join(dir, "tab-order.json"), stops);
    writeText(
      join(dir, "tab-order.txt"),
      stops
        .map((s) => `${String(s.index).padStart(3)} ${s.unit.padEnd(13)} ${s.role} "${s.name}" <${s.tag}>${s.focusVisible ? "" : " (no :focus-visible)"}${s.inViewport ? "" : " (OFF SCREEN)"}${s.underHeader ? " (UNDER HEADER)" : ""}`)
        .join("\n"),
    );
    log(`[${vp.tag}] Tab walk: ${stops.length} stops; under the header: ${stops.filter((s) => s.underHeader).length}; off screen: ${stops.filter((s) => !s.inViewport).length}; without :focus-visible: ${stops.filter((s) => !s.focusVisible).length}`);
    if (walkMessages.length) writeText(join(dir, "console-tabwalk.txt"), walkMessages.join("\n"));
    await walk.close();
  }

  // The small-screen menu: its open state and the four ways it closes.
  if (vp.isMobile) {
    const { page: m } = await open(context);
    await m.waitForTimeout(1200);
    const summary = m.locator("header details > summary").first();
    if ((await summary.count()) > 0 && (await summary.isVisible())) {
      const isOpen = () => m.locator("header details").first().evaluate((d) => d.open);
      const activeIsSummary = () => m.evaluate(() => document.activeElement?.tagName === "SUMMARY");
      const result = { media: (await m.evaluate(MEDIA)).media };
      const toggle = await summary.boundingBox();
      result.toggleBox = toggle && { width: Math.round(toggle.width), height: Math.round(toggle.height) };
      await summary.tap();
      await m.waitForTimeout(400);
      result.opensOnTap = await isOpen();
      const header = m.locator("body > header");
      writeText(join(dir, "menu-open.txt"), await header.evaluate((el) => el.innerText));
      writeText(join(dir, "menu-open.aria.yml"), await header.ariaSnapshot());
      const menuClient = await context.newCDPSession(m);
      await menuClient.send("DOM.enable");
      await menuClient.send("Accessibility.enable");
      const menuControls = (await axControls(menuClient)).filter((c) => c.unit === "header");
      writeJson(join(dir, "menu-open.controls.json"), menuControls);
      writeText(join(dir, "menu-open.controls.txt"), menuControls.map(controlLine).join("\n"));
      result.menuLinkBoxes = await m.locator("header details a").evaluateAll((links) =>
        links.map((a) => {
          const r = a.getBoundingClientRect();
          return `${a.textContent.trim()} ${Math.round(r.width)}x${Math.round(r.height)}`;
        }),
      );
      await m.screenshot({ path: join(dir, "menu-open.png"), clip: { x: 0, y: 0, width: vp.width, height: 460 } });

      // Escape with focus inside the menu: closes, focus back on the toggle.
      await m.keyboard.press("Tab");
      const focusInside = await m.evaluate(() => document.activeElement?.closest("details") !== null);
      await m.keyboard.press("Escape");
      await frames(m, 2);
      result.escape = { focusWasInside: focusInside, closed: !(await isOpen()), focusReturnedToToggle: await activeIsSummary() };

      // A press outside the menu closes it.
      await summary.tap();
      await m.waitForTimeout(250);
      const reopened = await isOpen();
      await m.touchscreen.tap(Math.round(vp.width * 0.3), Math.round(vp.height * 0.55));
      await frames(m, 2);
      result.outsidePress = { reopened, closed: !(await isOpen()) };

      // Choosing a link closes it and goes to the anchor.
      await m.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await summary.tap();
      await m.waitForTimeout(250);
      const firstLink = m.locator("header details a[href^='#']").first();
      const href = await firstLink.getAttribute("href");
      await firstLink.tap();
      await m.waitForTimeout(400);
      await settleScroll(m, 4000);
      result.linkChoice = {
        href,
        closed: !(await isOpen()),
        hash: await m.evaluate(() => location.hash),
        targetTopInViewport: await m.evaluate((h) => Math.round(document.querySelector(h)?.getBoundingClientRect().top ?? NaN), href),
        headerBottom: await m.evaluate(() => Math.round(document.querySelector("body > header").getBoundingClientRect().bottom)),
      };

      // Tab leaving the open menu closes it.
      await m.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await summary.focus();
      await m.keyboard.press("Enter");
      await frames(m, 2);
      const openedByKeyboard = await isOpen();
      const links = await m.locator("header details a").count();
      let presses = 0;
      let stillInside = true;
      while (stillInside && presses < links + 3) {
        await m.keyboard.press("Tab");
        presses += 1;
        stillInside = await m.evaluate(() => document.activeElement?.closest("header details") !== null);
      }
      await frames(m, 2);
      result.tabAway = {
        openedByKeyboard,
        linksInMenu: links,
        tabPressesToLeave: presses,
        closed: !(await isOpen()),
        focusLandedOn: await m.evaluate(() => {
          const el = document.activeElement;
          return el ? `${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60)}` : null;
        }),
      };
      writeJson(join(dir, "menu-behavior.json"), result);
      log(`[${vp.tag}] menu: ${JSON.stringify(result)}`);
    } else {
      log(`[${vp.tag}] no visible menu toggle`);
    }
    await m.close();
  }

  await context.close();
  return { tag: vp.tag, units, contextOptions };
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const started = new Date();
const results = [];
for (const vp of VIEWPORTS) results.push(await captureViewport(browser, vp));
writeJson(join(outRoot, "record.json"), {
  url: URL_,
  started: started.toISOString(),
  finished: new Date().toISOString(),
  browser: `msedge ${browser.version()}`,
  playwright: "playwright-core 1.63.0",
  viewports: results,
  log: report,
});
await browser.close();
console.log("done");
