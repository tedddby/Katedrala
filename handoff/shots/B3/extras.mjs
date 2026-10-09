// Supplementary baseline records (plan 4.4 item 1, gate GB) for the checks B3's later items compare against.
// Nothing here edits the site; it reads the page the dev server serves.
//   anchors.json               every id in the document and every link, with in-page fragments resolved
//   typography-1440.json/-390  computed type of headings, ledes, footnotes, the navigation and the page's buttons
//   hinge/<w>x<h>.json/.png    the five passes at 390, 768, 1024, 1180, 1280, 1350 and 1440: boxes per pass and per
//                              part, overflow past the pass, overlaps between passes and between parts, gutters
//   widths/<w>x<h>/            B3's units (skip link, header, how-it-works, get-started, footer) at 768x1024,
//                              1024x768, 1280x720 and 844x390: innerText, ariaSnapshot, controls, screenshots, and
//                              the open menu where the menu shows
//   header-320/                the header at 320x640 (touch) with normal spacing and with the WCAG 1.4.12
//                              text-spacing override: measurements and screenshots
// Screenshots are stitched viewport captures (see baseline.mjs: a capture beyond the viewport drops touch emulation).
// Usage: node extras.mjs <outDir> [--url=http://localhost:3100/]
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";

const args = process.argv.slice(2);
const outRoot = resolve(args.find((a) => !a.startsWith("--")) ?? "./extra");
// --only=type,hinge,widths,header320 runs a subset (all by default).
const ONLY = (args.find((a) => a.startsWith("--only=")) ?? "--only=").slice(7).split(",").filter(Boolean);
const want = (part) => ONLY.length === 0 || ONLY.includes(part);
const URL_ = (args.find((a) => a.startsWith("--url=")) ?? "--url=http://localhost:3100/").slice(6);
const origin = new URL(URL_).origin;
const UNIT_SELECTOR = "main > section[id], body > header, body > footer, body > a.skip-link";
const B3_UNITS = ["skip-link", "header", "how-it-works", "get-started", "footer"];
const unitSelectorFor = (unit) =>
  unit === "header" ? "body > header" : unit === "footer" ? "body > footer" : unit === "skip-link" ? "body > a.skip-link" : `main > section#${unit}`;
const WIDGET_ROLES = new Set([
  "button", "link", "checkbox", "radio", "tab", "menuitem", "option", "combobox", "listbox", "textbox", "slider",
  "switch", "DisclosureTriangle", "radiogroup", "tablist", "tabpanel", "toolbar", "menu", "grid", "tree", "region",
]);
const LINE_STATES = ["checked", "pressed", "selected", "expanded", "disabled", "hasPopup", "level", "orientation", "live", "atomic", "controls", "describedby"];
const normalizeIds = (s) => String(s).replace(/_R_[0-9a-zA-Z]+_/g, "«id»");
const stripOrigin = (s) => (typeof s === "string" && s.startsWith(origin) ? s.slice(origin.length) : s);
const writeText = (file, text) => writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`);
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const log = [];
const note = (line) => {
  log.push(line);
  console.log(line);
};

const UNIT_OF = `(el) => {
  const u = el.closest(${JSON.stringify(UNIT_SELECTOR)});
  if (!u) return "(outside)";
  return u.matches("main > section[id]") ? u.id : u.matches("body > header") ? "header" : u.matches("body > footer") ? "footer" : "skip-link";
}`;

async function newPage(browser, { width, height, touch }) {
  const options = {
    viewport: { width, height },
    deviceScaleFactor: touch ? 2 : 1,
    isMobile: touch,
    hasTouch: touch,
    reducedMotion: "no-preference",
    colorScheme: "dark",
  };
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const messages = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") messages.push(`${m.type()}: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => messages.push(`pageerror: ${e.message}`));
  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1600);
  return { context, page, messages, options };
}

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

async function scrollThrough(page, height) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += Math.round(height * 0.6)) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(300);
}

async function captureRange(page, vp, box, path, { deviceScale = false } = {}) {
  const s = deviceScale ? vp.deviceScaleFactor : 1;
  const left = Math.max(0, Math.floor(box.left));
  const width = Math.min(vp.width - left, Math.ceil(box.width));
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const height = Math.min(Math.ceil(box.height), docHeight - Math.round(box.top));
  const out = new PNG({ width: width * s, height: height * s });
  let done = 0;
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
    const part = PNG.sync.read(await page.screenshot({ clip: { x: left, y: inView, width, height: rows }, scale: deviceScale ? "device" : "css" }));
    PNG.bitblt(part, out, 0, 0, Math.min(part.width, width * s), Math.min(part.height, rows * s), 0, done * s);
    done += rows;
  }
  writeFileSync(path, PNG.sync.write(out));
}

async function boxOf(page, selector) {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height };
  });
}

async function axControls(page, context) {
  const client = await context.newCDPSession(page);
  await client.send("DOM.enable");
  await client.send("Accessibility.enable");
  const { nodes } = await client.send("Accessibility.getFullAXTree");
  const out = [];
  for (const n of nodes) {
    if (n.ignored || !n.backendDOMNodeId) continue;
    const role = n.role?.value ?? "";
    if (role === "RootWebArea") continue;
    const props = Object.fromEntries((n.properties ?? []).map((p) => [p.name, p.value]));
    if (!WIDGET_ROLES.has(role) && props.focusable?.value !== true) continue;
    let dom = {};
    try {
      const { object } = await client.send("DOM.resolveNode", { backendNodeId: n.backendDOMNodeId });
      const { result } = await client.send("Runtime.callFunctionOn", {
        objectId: object.objectId,
        functionDeclaration: `function () {
          const el = this.nodeType === 1 ? this : this.parentElement;
          const unitOf = ${UNIT_OF};
          const r = el.getBoundingClientRect();
          return { unit: unitOf(el), tag: el.tagName.toLowerCase(), tabIndex: el.tabIndex, rendered: el.getClientRects().length > 0,
            rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 } };
        }`,
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
      } else states[key] = key === "url" ? stripOrigin(v.value) : v.value;
    }
    out.push({ unit: dom.unit, role, name: n.name?.value ?? "", ...(n.value?.value ? { value: n.value.value } : {}), states, dom });
  }
  await client.detach();
  return out;
}

function controlLine(c) {
  const parts = [`${c.role} "${c.name}"`];
  if (c.value !== undefined) parts.push(`value="${c.value}"`);
  for (const key of LINE_STATES) {
    const v = c.states[key];
    if (v === undefined || v === false || v === "false" || (Array.isArray(v) && v.length === 0)) continue;
    parts.push(Array.isArray(v) ? `${key}=[${v.map(normalizeIds).join(", ")}]` : v === true ? key : `${key}=${v}`);
  }
  if (c.states.url) parts.push(`url=${c.states.url}`);
  if (c.states.focusable) parts.push("focusable");
  parts.push(`<${c.dom.tag ?? "?"} tabindex=${c.dom.tabIndex}${c.dom.rendered === false ? " not-rendered" : ""}> ${c.dom.rect ? `${c.dom.rect.w}x${c.dom.rect.h}` : ""}`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ channel: "msedge", headless: true });
const started = new Date();
mkdirSync(outRoot, { recursive: true });

// 1. Anchors and typography at 1440 and 390.
for (const vp of !want("type") ? [] : [
  { tag: "1440", width: 1440, height: 900, touch: false },
  { tag: "390", width: 390, height: 844, touch: true },
]) {
  const { context, page } = await newPage(browser, vp);
  await scrollThrough(page, vp.height);
  if (vp.tag === "1440") {
    const anchors = await page.evaluate((unitOfSource) => {
      const unitOf = eval(unitOfSource);
      const ids = [...document.querySelectorAll("[id]")].map((e) => ({ id: e.id, tag: e.tagName.toLowerCase(), unit: unitOf(e) }));
      const seen = new Map();
      for (const { id } of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
      const links = [...document.querySelectorAll("a[href]")].map((a) => {
        const url = new URL(a.getAttribute("href"), location.href);
        const same = url.origin === location.origin && url.pathname === location.pathname;
        return {
          unit: unitOf(a),
          text: (a.getAttribute("aria-label") ?? a.textContent).trim().replace(/\s+/g, " "),
          href: a.getAttribute("href"),
          sameDocument: same,
          fragment: url.hash || null,
          targetExists: same && url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) !== null : null,
          rendered: a.getClientRects().length > 0,
        };
      });
      return {
        sectionIds: [...document.querySelectorAll("main > section[id]")].map((s) => s.id),
        inPageTargets: [...new Set(links.filter((l) => l.sameDocument && l.fragment).map((l) => l.fragment))],
        externalFragments: [...new Set(links.filter((l) => !l.sameDocument && l.fragment).map((l) => l.href))],
        duplicateIds: [...seen].filter(([, n]) => n > 1).map(([id]) => id),
        ids,
        links,
      };
    }, UNIT_OF);
    writeJson(join(outRoot, "anchors.json"), anchors);
    const missing = anchors.links.filter((l) => l.targetExists === false);
    note(`anchors: ${anchors.sectionIds.length} section ids; ${anchors.ids.length} ids; ${anchors.links.length} links; in-page targets ${anchors.inPageTargets.join(" ")}; missing targets: ${missing.length}; duplicate ids: ${anchors.duplicateIds.length}`);
  }
  const type = await page.evaluate((unitOfSource) => {
    const unitOf = eval(unitOfSource);
    const selector = "h1, h2, h3, p.lede, p.footnote, body > header a, body > header summary, main a.group, footer p, footer a";
    return [...document.querySelectorAll(selector)]
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        // Lines of text, counted from the text's own line boxes (padding and control height do not count).
        // Visible text nodes only: screen-reader-only text is clipped to a 1 px box and is not a line.
        const tops = new Set();
        const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          if (node.textContent.trim() === "" || node.parentElement?.closest(".sr-only")) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.width > 1.5 && rect.height > 1.5) tops.add(Math.round(rect.top + rect.height / 2));
          }
        }
        const lineTops = [...tops].sort((a, b) => a - b);
        let lines = 0;
        for (let i = 0; i < lineTops.length; i += 1) {
          if (i === 0 || lineTops[i] - lineTops[i - 1] > parseFloat(cs.fontSize) * 0.6) lines += 1;
        }
        return {
          unit: unitOf(e),
          tag: e.tagName.toLowerCase(),
          class: (e.getAttribute("class") ?? "").slice(0, 120),
          text: e.textContent.trim().replace(/\s+/g, " ").slice(0, 90),
          fontFamily: cs.fontFamily.split(",")[0].replace(/["']/g, ""),
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
          letterSpacing: cs.letterSpacing,
          fontVariationSettings: cs.fontVariationSettings,
          fontStretch: cs.fontStretch,
          color: cs.color,
          textWrap: cs.textWrap,
          box: { x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
          lines,
          srOnly: [...e.querySelectorAll(".sr-only")].map((s) => s.textContent),
          ...(e.closest("details:not([open])") && !e.closest("summary") ? { insideClosedMenu: true } : {}),
        };
      });
  }, UNIT_OF);
  writeJson(join(outRoot, `typography-${vp.tag}.json`), type);
  const cta = type.find((t) => t.unit === "get-started" && t.tag === "h2");
  note(`typography ${vp.tag}: ${type.length} elements; final headline ${cta?.fontSize} ${cta?.fontVariationSettings} ${cta?.lines} lines`);
  await context.close();
}

// 2. The five passes across widths.
if (want("hinge")) mkdirSync(join(outRoot, "hinge"), { recursive: true });
for (const [width, height, touch] of !want("hinge") ? [] : [
  [390, 844, true], [768, 1024, true], [1024, 768, false], [1180, 820, false], [1280, 720, false], [1350, 900, false], [1440, 900, false],
]) {
  const vp = { width, height, touch, deviceScaleFactor: touch ? 2 : 1 };
  const { context, page } = await newPage(browser, vp);
  const record = await page.evaluate(() => {
    const PARTS = ["pipeline-number", "pipeline-verb", "pipeline-text", "pipeline-status", "pipeline-artifact"];
    const r1 = (v) => Math.round(v * 10) / 10;
    const boxOf = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r1(r.left), y: r1(r.top + scrollY), w: r1(r.width), h: r1(r.height) };
    };
    const hit = (a, b) => {
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return ix > 0.5 && iy > 0.5 ? `${r1(ix)}x${r1(iy)}` : null;
    };
    const stages = [...document.querySelectorAll("#how-it-works li.pipeline-stage")];
    const rows = stages.map((li, i) => {
      const box = boxOf(li);
      const parts = {};
      for (const p of PARTS) {
        const el = li.querySelector(`.${p}`);
        if (el) parts[p.replace("pipeline-", "")] = boxOf(el);
      }
      // Anything inside the pass (but the beam) painting past its box, left or right.
      let pastRight = 0;
      let pastLeft = 0;
      for (const el of li.querySelectorAll("*")) {
        if (el.closest(".pipeline-beam")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        pastRight = Math.max(pastRight, r.right - (box.x + box.w));
        pastLeft = Math.max(pastLeft, box.x - r.left);
      }
      const clipped = [...li.querySelectorAll("p, dd, dt, h3")].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim().slice(0, 40));
      return {
        pass: i + 1,
        verb: li.querySelector(".pipeline-verb")?.textContent.trim(),
        box,
        parts,
        paintsPastRight: r1(Math.max(0, pastRight)),
        paintsPastLeft: r1(Math.max(0, pastLeft)),
        clipped,
        artifactLines: [...li.querySelectorAll(".pipeline-artifact > div")].map((d) => {
          const dt = d.querySelector("dt").getBoundingClientRect();
          const dd = d.querySelector("dd").getBoundingClientRect();
          return `${d.querySelector("dt").textContent}=${d.querySelector("dd").textContent} ${Math.abs(dt.top - dd.top) < 2 ? "one line" : "value below key"}`;
        }),
      };
    });
    const between = [];
    const within = [];
    for (let i = 0; i < rows.length; i += 1) {
      const names = Object.keys(rows[i].parts);
      for (let a = 0; a < names.length; a += 1) {
        for (let b = a + 1; b < names.length; b += 1) {
          const h = hit(rows[i].parts[names[a]], rows[i].parts[names[b]]);
          if (h) within.push(`${rows[i].verb}: ${names[a]} x ${names[b]} ${h}`);
        }
      }
      for (let j = i + 1; j < rows.length; j += 1) {
        const h = hit(rows[i].box, rows[j].box);
        if (h) between.push(`${rows[i].verb} box x ${rows[j].verb} box ${h}`);
        for (const p of names) {
          for (const q of Object.keys(rows[j].parts)) {
            const h2 = hit(rows[i].parts[p], rows[j].parts[q]);
            if (h2) between.push(`${rows[i].verb}.${p} x ${rows[j].verb}.${q} ${h2}`);
          }
        }
      }
    }
    const horizontal = rows.length > 1 && rows.every((r) => Math.abs(r.box.y - rows[0].box.y) < 1);
    const gutters = rows.slice(1).map((r, i) => {
      const prev = rows[i];
      return horizontal ? r1(r.box.x - (prev.box.x + prev.box.w)) : r1(r.box.y - (prev.box.y + prev.box.h));
    });
    const section = document.querySelector("#how-it-works").getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      layout: horizontal ? "beam across (one column per pass)" : "beam down (one row per pass)",
      sectionHeight: r1(section.height),
      docScrollWidth: document.documentElement.scrollWidth,
      gutters,
      overlapsBetweenPasses: between,
      overlapsWithinPass: within,
      rows,
    };
  });
  const tag = `${width}x${height}`;
  writeJson(join(outRoot, "hinge", `${tag}.json`), { context: { touch }, ...record });
  await page.addStyleTag({ content: "body > header, body > a.skip-link { visibility: hidden !important; }" });
  await captureRange(page, vp, await boxOf(page, "#how-it-works"), join(outRoot, "hinge", `${tag}.png`));
  const past = record.rows.filter((r) => r.paintsPastRight > 0.5 || r.paintsPastLeft > 0.5).map((r) => `${r.verb} +${r.paintsPastRight}/-${r.paintsPastLeft}`);
  note(`hinge ${tag}: ${record.layout}; height ${record.sectionHeight}; gutters ${record.gutters.join(",")}; overlaps between ${record.overlapsBetweenPasses.length}, within ${record.overlapsWithinPass.length}; painting past a pass: ${past.length ? past.join("; ") : "none"}; clipped text: ${record.rows.flatMap((r) => r.clipped).length}; doc width ${record.docScrollWidth}`);
  await context.close();
}

// 3. B3's units at the in-between widths.
for (const [width, height, touch] of !want("widths") ? [] : [
  [768, 1024, true], [1024, 768, false], [1280, 720, false], [844, 390, true],
]) {
  const vp = { width, height, touch, deviceScaleFactor: touch ? 2 : 1 };
  const tag = `${width}x${height}`;
  const dir = join(outRoot, "widths", tag);
  mkdirSync(dir, { recursive: true });
  const { context, page, messages, options } = await newPage(browser, vp);
  await page.screenshot({ path: join(dir, "first-viewport.png"), scale: "css" });
  await scrollThrough(page, height);
  const controls = await axControls(page, context);
  const geometry = await page.evaluate((selector) => {
    const rows = [];
    for (const el of document.querySelectorAll(selector)) {
      const key = el.matches("main > section[id]") ? el.id : el.matches("body > header") ? "header" : el.matches("body > footer") ? "footer" : "skip-link";
      const r = el.getBoundingClientRect();
      rows.push({ unit: key, top: Math.round(r.top + scrollY), height: Math.round(r.height) });
    }
    return { scrollHeight: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth, units: rows };
  }, UNIT_SELECTOR);
  writeJson(join(dir, "geometry.json"), { context: options, ...geometry });
  for (const unit of B3_UNITS) {
    const locator = page.locator(unitSelectorFor(unit)).first();
    writeText(join(dir, `${unit}.txt`), await locator.evaluate((el) => el.innerText));
    writeText(join(dir, `${unit}.aria.yml`), await locator.ariaSnapshot());
    const mine = controls.filter((c) => c.unit === unit);
    writeJson(join(dir, `${unit}.controls.json`), mine);
    writeText(join(dir, `${unit}.controls.txt`), mine.map(controlLine).join("\n") || "(no controls)");
  }
  await captureRange(page, vp, { ...(await boxOf(page, "body > header")), top: 0 }, join(dir, "header.png"), { deviceScale: true });
  const hide = await page.addStyleTag({ content: "body > header, body > a.skip-link { visibility: hidden !important; }" });
  for (const unit of ["how-it-works", "get-started", "footer"]) {
    const box = await boxOf(page, unitSelectorFor(unit));
    await captureRange(page, vp, box, join(dir, `${unit}.png`));
  }
  await hide.evaluate((node) => node.remove());
  // The open menu, where the menu shows.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(200);
  const summary = page.locator("header details > summary").first();
  if (await summary.isVisible()) {
    if (touch) await summary.tap();
    else await summary.click();
    await page.waitForTimeout(400);
    writeText(join(dir, "menu-open.aria.yml"), await page.locator("body > header").ariaSnapshot());
    const menu = (await axControls(page, context)).filter((c) => c.unit === "header");
    writeText(join(dir, "menu-open.controls.txt"), menu.map(controlLine).join("\n"));
    await page.screenshot({ path: join(dir, "menu-open.png"), clip: { x: 0, y: 0, width, height: Math.min(height, 460) }, scale: "css" });
  }
  writeText(join(dir, "console.txt"), messages.join("\n") || "(no errors or warnings)");
  note(`widths ${tag}: height ${geometry.scrollHeight}, width ${geometry.scrollWidth}; menu ${(await summary.isVisible()) ? "shown" : "inline links"}; header controls ${controls.filter((c) => c.unit === "header").length}`);
  await context.close();
}

// 4. The header at 320 with normal spacing and with the WCAG 1.4.12 text-spacing override.
if (want("header320")) {
  const dir = join(outRoot, "header-320");
  mkdirSync(dir, { recursive: true });
  const vp = { width: 320, height: 640, touch: true, deviceScaleFactor: 2 };
  const { context, page } = await newPage(browser, vp);
  const measure = () =>
    page.evaluate(() => {
      const r1 = (v) => Math.round(v * 10) / 10;
      const h = document.querySelector("body > header");
      const parts = {
        header: h,
        frame: h.querySelector(".frame"),
        wordmarkLink: h.querySelector('a[href="#top"]'),
        menuButton: h.querySelector("summary"),
      };
      // On a phone the layout viewport widens to the widest content, so the fixed header (inset-x-0) widens with it
      // while the screen stays 320 px: the cut is measured against the screen.
      const screenWidth = 320;
      const out = {
        screenWidth,
        layoutViewportWidth: innerWidth,
        visualViewport: { width: r1(visualViewport.width), scale: r1(visualViewport.scale * 100) / 100 },
        docScrollWidth: document.documentElement.scrollWidth,
      };
      for (const [k, el] of Object.entries(parts)) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        out[k] = { left: r1(r.left), right: r1(r.right), top: r1(r.top), bottom: r1(r.bottom), w: r1(r.width), h: r1(r.height) };
      }
      out.menuButtonCutAtRight = r1(Math.max(0, out.menuButton.right - screenWidth));
      // What is wider than the screen: the outermost elements reaching past 320 px, widest first.
      const wide = [];
      for (const el of document.querySelectorAll("body *")) {
        if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= screenWidth + 0.5) continue;
        let clipped = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (/(auto|scroll|hidden|clip)/.test(cs.overflowX) && p.getBoundingClientRect().right <= screenWidth + 0.5) {
            clipped = true;
            break;
          }
        }
        if (clipped) continue;
        const parentReaches = el.parentElement && el.parentElement !== document.body && el.parentElement.getBoundingClientRect().right > screenWidth + 0.5;
        if (parentReaches) continue;
        const u = el.closest("main > section[id], body > header, body > footer");
        wide.push({
          unit: u ? (u.id || u.tagName.toLowerCase()) : "(page)",
          element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${(el.getAttribute("class") ?? "").split(/\s+/).slice(0, 4).join(".")}`,
          text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 60),
          right: r1(r.right),
          width: r1(r.width),
        });
      }
      out.widerThanScreen = wide.sort((a, b) => b.right - a.right).slice(0, 12);
      return out;
    });
  const normal = await measure();
  writeJson(join(dir, "normal.json"), normal);
  await page.screenshot({ path: join(dir, "normal.png"), clip: { x: 0, y: 0, width: 320, height: 400 } });
  await page.addStyleTag({
    content: "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }",
  });
  await frames(page, 3);
  await page.waitForTimeout(200);
  const spaced = await measure();
  writeJson(join(dir, "text-spacing.json"), spaced);
  await page.screenshot({ path: join(dir, "text-spacing.png"), clip: { x: 0, y: 0, width: 320, height: Math.min(640, Math.ceil(spaced.header.h) + 40) } });
  note(`header 320: normal ${normal.header.w}x${normal.header.h}, Menu right ${normal.menuButton.right} (cut ${normal.menuButtonCutAtRight}), doc width ${normal.docScrollWidth}; text-spacing ${spaced.header.w}x${spaced.header.h}, Menu right ${spaced.menuButton.right} (cut ${spaced.menuButtonCutAtRight}), doc width ${spaced.docScrollWidth}, layout viewport ${spaced.layoutViewportWidth}; wider than the screen: ${spaced.widerThanScreen.map((w) => `${w.unit} ${w.element} (${w.right})`).join("; ") || "nothing"}`);
  await context.close();
}

writeJson(join(outRoot, "record.json"), {
  url: URL_,
  started: started.toISOString(),
  finished: new Date().toISOString(),
  browser: `msedge ${browser.version()}`,
  log,
});
await browser.close();
console.log("done");
