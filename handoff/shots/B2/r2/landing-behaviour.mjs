// The landing's controls in film mode: select, quick picks, the direction, hover paths, Escape, drawing pins.
import { chromium } from "playwright-core";
const [w, h] = (process.argv[2] ?? "1440x900").split("x").map(Number);
const mode = process.argv[3] ?? "film";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const mobile = w < 600;
const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, reducedMotion: mode === "still" ? "reduce" : "no-preference" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(2000);
if (mode === "film") {
  await page.evaluate(() => { const f = window.__kfilm; const P = f.clock.progressOf(3, 0.4); window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" }); });
} else {
  await page.evaluate(() => document.querySelector('[data-act-slot="trace"]').scrollIntoView({ behavior: "instant" }));
}
await page.waitForTimeout(2500);
const state = () => page.evaluate(() => ({
  readout: document.querySelector("[data-ld-readout]").textContent,
  select: document.querySelector("[data-ld-file]").value,
  picks: [...document.querySelectorAll("[data-ld-pick]")].map((b) => b.getAttribute("aria-pressed")).join(""),
  pinned: window.__kfilm?.pinned ?? null,
  status: document.querySelector("[data-film-status]")?.textContent ?? "",
}));
const results = [];
const check = (name, ok, detail) => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
let s = await state();
check("initial readout", s.readout === "Choose a file to trace it.", s.readout);
// Select a file.
const cnIndex = await page.evaluate(() => [...document.querySelectorAll("[data-ld-file] option")].find((o) => o.textContent === "src/lib/utils/cn.ts").value);
await page.selectOption("[data-ld-file]", cnIndex);
await page.waitForTimeout(600);
s = await state();
check("select cn.ts: stands on", s.readout.startsWith("src/lib/utils/cn.ts"), s.readout);
check("cn.ts pick pressed", s.picks === "falsefalsefalsetrue", s.picks);
// Direction: what rests on it.
await page.click('[data-ld-show] label:has(input[value="up"])');
await page.waitForTimeout(600);
s = await state();
check("rests readout", s.readout === "88 files rest on src/lib/utils/cn.ts at runtime, 63 directly; 90 with type-only dependencies; 113 with tests.", s.readout);
check("readout under 26 words", s.readout.split(/\s+/).length <= 25, String(s.readout.split(/\s+/).length));
// Quick pick: types.ts.
await page.click('[data-ld-pick] >> nth=1');
await page.waitForTimeout(600);
s = await state();
check("pick types.ts", s.readout.startsWith("147 files rest on src/graph/model/types.ts at runtime, 48 directly; 265 with type-only dependencies; 409 with tests."), s.readout);
check("types.ts pressed, select follows", s.picks === "falsetruefalsefalse" && s.select !== "", `${s.picks} ${s.select}`);
await page.screenshot({ path: `r2/ld-${mode}-${w}-types-up.png` });
// Back to stands on: page.tsx.
await page.click('[data-ld-show] label:has(input[value="down"])');
await page.click('[data-ld-pick] >> nth=0');
await page.waitForTimeout(600);
s = await state();
check("page.tsx stands on", s.readout === "src/app/page.tsx stands on 137 files at runtime, 40 of them foundations.", s.readout);
// Toggle the same pick off.
await page.click('[data-ld-pick] >> nth=0');
await page.waitForTimeout(400);
s = await state();
check("pick again clears", s.readout === "Choose a file to trace it." && s.picks === "falsefalsefalsefalse" && s.select === "", JSON.stringify(s));
// Escape clears a trace chosen from the select.
await page.selectOption("[data-ld-file]", cnIndex);
await page.waitForTimeout(300);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
s = await state();
check("Escape clears", s.readout === "Choose a file to trace it." && s.select === "", JSON.stringify(s));
// Keyboard: the radio group is one Tab stop with arrow keys.
await page.focus('[data-ld-show] input[value="down"]');
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(200);
const radio = await page.evaluate(() => ({ checked: document.querySelector('[data-ld-show] input:checked').value, active: document.activeElement.value }));
check("ArrowRight moves and selects", radio.checked === "up" && radio.active === "up", JSON.stringify(radio));
await page.keyboard.press("Tab");
const afterTab = await page.evaluate(() => document.activeElement.id || document.activeElement.tagName);
check("Tab leaves the group for the select", afterTab === "kfilm-file", afterTab);
// The select: every source file, by folder, themed from the palette; the readout a polite atomic status.
const sel = await page.evaluate(() => {
  const el = document.querySelector("[data-ld-file]");
  const cs = getComputedStyle(el);
  const opt = el.querySelector("optgroup option");
  const ocs = getComputedStyle(opt);
  const groups = el.querySelectorAll("optgroup");
  const readout = document.querySelector("[data-ld-readout]");
  return {
    options: el.querySelectorAll("optgroup option").length,
    groups: groups.length,
    labels: [...groups].map((g) => g.label).join(" "),
    bg: cs.backgroundColor, color: cs.color, scheme: cs.colorScheme, font: cs.fontFamily.split(",")[0], appearance: cs.appearance,
    optBg: ocs.backgroundColor, optColor: ocs.color,
    role: readout.getAttribute("role"), atomic: readout.getAttribute("aria-atomic"),
    label: document.querySelector('label[for="kfilm-file"]')?.textContent,
  };
});
check("select: 404 files in 14 folder groups", sel.options === 404 && sel.groups === 14, `${sel.options} options, ${sel.groups} groups: ${sel.labels}`);
check("select themed (dark ground, palette ink, dark color-scheme, mono)", sel.scheme === "dark" && sel.appearance === "none" && sel.bg !== "rgba(0, 0, 0, 0)" && sel.optBg !== "rgba(0, 0, 0, 0)", `select ${sel.bg} on ${sel.color}, scheme ${sel.scheme}, ${sel.font}; option ${sel.optBg} on ${sel.optColor}`);
check("readout role=status aria-atomic=true, select labelled", sel.role === "status" && sel.atomic === "true" && sel.label === "File", `${sel.role} ${sel.atomic} label ${sel.label}`);
console.log(results.join("\n"));
if (errors.length) console.log("errors:", errors.join("\n"));
await browser.close();
