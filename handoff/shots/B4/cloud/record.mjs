// B4: records my plates (innerText, ariaSnapshot, controls) in B3's baseline format, for diffs.
// Usage: node record.mjs <outDir> [units] [--url=]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
const args = process.argv.slice(2);
const outRoot = resolve(args[0] ?? './rec');
const UNITS = (args[1] ?? 'architecture,gravity,entropy,rules').split(',');
const URL_ = process.env.URL_ ?? 'http://localhost:3100/';
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


const VIEWPORTS = [
  { tag: '1440', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { tag: '390', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
for (const vp of VIEWPORTS) {
  const dir = join(outRoot, vp.tag);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch, reducedMotion: 'no-preference', colorScheme: 'dark' });
  const page = await context.newPage();
  const messages = [];
  page.on('pageerror', (e) => messages.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') messages.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(URL_, { waitUntil: 'networkidle', timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  const client = await context.newCDPSession(page);
  await client.send('DOM.enable');
  await client.send('Accessibility.enable');
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += Math.round(vp.height * 0.6)) { await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y); await page.waitForTimeout(80); }
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(500);
  const controls = await axControls(client);
  for (const unit of UNITS) {
    const loc = page.locator(unitSelectorFor(unit)).first();
    const NL = String.fromCharCode(10);
    writeFileSync(join(dir, unit + '.txt'), (await loc.innerText()) + NL);
    writeFileSync(join(dir, unit + '.aria.yml'), normalizeIds(await loc.ariaSnapshot()) + NL);
    writeFileSync(join(dir, unit + '.controls.txt'), controls.filter((c) => c.unit === unit).map(controlLine).join(NL) + NL);
  }
  console.log(vp.tag, 'messages', messages);
  await context.close();
}
await browser.close();
