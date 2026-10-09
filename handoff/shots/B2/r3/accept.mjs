// Plan 4.3 B2 acceptance in the film: Act II (dependency on screen and lit, symbol names, the seven observed lines,
// the record, legibility, the detail's scale, both status marks), Act III (step counts, scope sentence, crown path,
// status for the whole act, scope line), at one viewport. Usage: node r3/accept.mjs <w>x<h>
import { chromium } from "playwright-core";
const [size] = process.argv.slice(2);
const [w, h] = size.split("x").map(Number);
const mobile = w < 600;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const go = async (act, t, wait = 1600) => {
  await page.evaluate(([act, t]) => {
    const f = window.__kfilm;
    const P = f.clock.progressOf(act, t);
    window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" });
  }, [act, t]);
  await page.waitForTimeout(wait);
};
const results = [];
const check = (name, pass, evidence) => results.push({ name, pass, evidence });

// Act II, E1: the dependency on screen and lit.
await go(1, 0.19);
const e1 = await page.evaluate(() => {
  const f = window.__kfilm;
  const m = f.model;
  const a = m.paths.indexOf("src/analysis/analysis-service.ts");
  const b = m.paths.indexOf("src/analysis/cache-key.ts");
  let k = -1;
  for (const e of m.out[a] ?? []) if (m.edgeB[e] === b) k = e;
  const mask = f.acts[1].lit(0.19, m);
  const pt = { x: 0, y: 0, depth: 0, visible: false };
  const W = innerWidth, H = innerHeight;
  const on = (v) => { f.stage.screenOf(v, pt); return { x: Math.round(pt.x), y: Math.round(pt.y), visible: pt.visible && pt.x > 0 && pt.x < W && pt.y > 0 && pt.y < H }; };
  const labels = [...document.querySelectorAll("[data-label][data-on]")].map((el) => el.textContent);
  return { a, b, k, litA: mask?.nodes[a], litB: mask?.nodes[b], litK: mask?.edges[k], dim: mask?.dim, sa: on(a), sb: on(b), labels };
});
check("II E1 dependency lit (both files and the chain)", e1.litA === 1 && e1.litB === 1 && e1.litK === 1, `nodes ${e1.a}:${e1.litA} ${e1.b}:${e1.litB}, chain ${e1.k}:${e1.litK}, dim ${e1.dim}`);
check("II E1 dependency on screen", e1.sa.visible && e1.sb.visible, `dependent at ${e1.sa.x},${e1.sa.y}; dependency at ${e1.sb.x},${e1.sb.y}`);
check("II E1 both ends named", e1.labels.some((t) => t.includes("analysis-service.ts")) && e1.labels.some((t) => t.includes("cache-key.ts")), e1.labels.join(" | "));

// Act II, E2 and E3: status marks, rulers.
for (const [t, beat] of [[0.38, "E2"], [0.57, "E3"]]) {
  await go(1, t, 2000);
  const s = await page.evaluate(() => [...document.querySelectorAll("[data-caption][data-on] [data-status]")].map((el) => ({ text: el.textContent, status: el.dataset.status, op: getComputedStyle(el.closest("[class*=extra]") ?? el).opacity })));
  check(`II ${beat} Available today beside the caption`, s.some((x) => x.status === "available" && x.text === "Available today" && Number(x.op) > 0.99), JSON.stringify(s));
}
const e3 = await page.evaluate(() => {
  const words = [...document.querySelectorAll("[data-ev-diagram][data-on] [data-ev-word]")].filter((el) => Number(getComputedStyle(el).opacity) > 0.5);
  const sizes = [];
  for (const el of words) for (const c of [el, ...el.querySelectorAll("*")]) if (c.childNodes.length && [...c.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) sizes.push(parseFloat(getComputedStyle(c).fontSize));
  const text = (kind) => words.filter((el) => el.dataset.evWord === kind).map((el) => el.textContent);
  return { lines: text("line"), syms: text("sym"), heads: text("head"), minSize: Math.min(...sizes), count: words.length };
});
const seven = ["25", "164", "189", "190", "219", "273", "358"];
check("II E3 seven observed lines shown", seven.every((n) => e3.lines.includes(n)) && e3.lines.length === 7, e3.lines.join(","));
check("II E3 symbol names", ["createAnalysisService", "stableStringify", "limitsHash", "graphCacheKey", "latestGraphPointerKey"].every((n) => e3.syms.some((s) => s.startsWith(n))), e3.syms.join(" | "));
check("II E3 4x detail states its scale", e3.heads.some((t) => t.includes("detail at 4× scale")), e3.heads.join(" | "));
check("II E3 words legible >= 11px", e3.minSize >= 11, `min ${e3.minSize}px over ${e3.count} words`);

// Act II, E4: the record.
await go(1, 0.76, 2000);
const e4 = await page.evaluate(() => {
  const rec = document.querySelector("[data-ev-record]");
  const shown = rec.hasAttribute("data-shown") && Number(getComputedStyle(rec).opacity) > 0.99;
  const body = rec.querySelector(".code-block-body") ?? rec.querySelector("pre");
  const cond = document.querySelector("[data-ev-condensed]");
  const condOn = cond.hasAttribute("data-on") && Number(getComputedStyle(cond).opacity) > 0.99;
  const condSizes = [...cond.querySelectorAll("p, code, span")].map((el) => parseFloat(getComputedStyle(el).fontSize));
  const r = rec.getBoundingClientRect();
  return { shown, bodySize: body ? parseFloat(getComputedStyle(body).fontSize) : 0, condOn, condMin: Math.min(...condSizes), condText: cond.textContent, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
});
if (e4.shown) check("II E4 the record shown, legible >= 11px", e4.bodySize >= 11, `record ${e4.rect.join(",")}, body ${e4.bodySize}px`);
else check("II E4 the condensed record shown, legible >= 11px", e4.condOn && e4.condMin >= 11, `condensed min ${e4.condMin}px: ${e4.condText}`);

// Act III.
const counts = [];
for (const t of [0.51, 0.578, 0.645, 0.75]) {
  await go(2, t, 1200);
  counts.push(await page.evaluate(() => document.querySelector("[data-ch-value]").textContent));
}
check("III per-step counts 48, 126, 143, 147", counts.join(",") === "48,126,143,147", counts.join(","));
const swaps = [];
for (const t of [0.02, 0.3, 0.6, 0.98]) {
  await go(2, t, 900);
  swaps.push(await page.evaluate(() => { const s = document.querySelector("[data-ch-titleblock]"); return s.hasAttribute("data-on") && s.textContent.includes("Impact analysis, planned for v1"); }));
}
check("III Planned for v1 in the title block for the whole act", swaps.every(Boolean), swaps.join(","));
await go(2, 0.1, 2000);
const c1 = await page.evaluate(() => [...document.querySelectorAll("[data-caption][data-on]")].map((c) => ({ id: c.dataset.caption, status: [...c.querySelectorAll("[data-status]")].map((s) => `${s.dataset.status}:${s.textContent}`) })));
check("III Planned for v1 beside the act title", c1.some((c) => c.id === "change-title" && c.status.includes("planned:Planned for v1")), JSON.stringify(c1));
await go(2, 0.6, 2000);
const c3 = await page.evaluate(() => [...document.querySelectorAll("[data-caption][data-on]")].map((c) => ({ id: c.dataset.caption, text: c.textContent })));
check("III scope line beside the step counts", c3.some((c) => c.id === "change-rise" && c.text.includes("Traced by this page over the dependencies in Katedrala’s analysis of CodeVerse.")), JSON.stringify(c3));
await go(2, 0.92, 2000);
const c4 = await page.evaluate(() => ({
  captions: [...document.querySelectorAll("[data-caption][data-on]")].map((c) => ({ id: c.dataset.caption, text: c.textContent })),
  labels: [...document.querySelectorAll("[data-label][data-on]")].map((el) => el.textContent),
  bold: [...document.querySelectorAll("[data-ch-path]")].map((p) => ({ d: (p.getAttribute("d") ?? "").length, op: getComputedStyle(p).opacity })),
  lit: (() => { const f = window.__kfilm; const m = f.model; const mask = f.acts[2].lit(0.92, m); const crown = m.crown; return { crown: m.paths[crown], lit: mask?.nodes[crown] }; })(),
}));
const reach = c4.captions.find((c) => c.id === "change-reach");
check("III 265 and 409 in the scope sentence", reach !== undefined && reach.text.includes("265") && reach.text.includes("409"), reach?.text ?? "none");
check("III scope line beside the totals", reach !== undefined && reach.text.includes("Traced by this page over the dependencies"), "");
check("III crown path lit and named", c4.lit.lit === 1 && c4.labels.some((t) => t.includes("src/app/page.tsx") && t.includes("the crown")), `crown ${c4.lit.crown} lit ${c4.lit.lit}; labels: ${c4.labels.join(" | ")}; bold ${JSON.stringify(c4.bold)}`);

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name} -- ${r.evidence}`);
if (errors.length) console.log("errors:", errors.join("\n"));
await browser.close();
