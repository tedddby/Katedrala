// The hinge plate at the plan's widths: screenshots, and the acceptance geometry: no pass row overlaps another,
// no part runs out of its pass or past the window, the chain's weights sit on the verbs' lines, every length of
// chain meets the weights at both ends, and the Parse and Link artifacts read what the evidence JSON says.
// Usage: node hinge.mjs <outDir> [widths, e.g. 390x844,1440x900] [--url=http://localhost:3100/]
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const out = resolve(positional[0] ?? "./hinge");
mkdirSync(out, { recursive: true });
const widths = (positional[1] ?? "390x844,768x1024,1024x768,1180x820,1280x720,1350x900,1440x900,320x640,1920x1080")
  .split(",")
  .map((s) => s.split("x").map(Number));
const URL_ = (args.find((a) => a.startsWith("--url=")) ?? "--url=http://localhost:3100/").slice(6);
const evidence = JSON.parse(
  readFileSync("/katedrala/site/public/data/codeverse-evidence.json", "utf8"),
);
const browser = await chromium.launch({ channel: "msedge" });
const report = {};
for (const [w, h] of widths) {
  const touch = w < 768;
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: touch ? 2 : 1,
    isMobile: touch,
    hasTouch: touch,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#how-it-works").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const sec = document.querySelector("#how-it-works");
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return { l: b.left, t: b.top + scrollY, r: b.right, b: b.bottom + scrollY, w: b.width, h: b.height };
    };
    const lh = (el) => parseFloat(getComputedStyle(el).lineHeight);
    const passes = [...sec.querySelectorAll(".hinge-pass")].map((li) => {
      const parts = {};
      for (const [name, sel] of [
        ["number", ".hinge-number"],
        ["verb", ".hinge-verb"],
        ["text", ".hinge-text"],
        ["status", ".hinge-status"],
        ["artifact", ".hinge-artifact"],
        ["weight", ".hinge-weight"],
        ["chain", ".hinge-chain"],
      ])
        parts[name] = box(li.querySelector(sel));
      const before = getComputedStyle(li.querySelector(".hinge-chain"), "::before");
      const segTop = parts.chain.t + parseFloat(before.top);
      const segBottom = parts.chain.b - parseFloat(before.bottom);
      const verbLineMid = parts.verb.t + lh(li.querySelector(".hinge-verb")) / 2;
      const artifactRows = [...li.querySelectorAll(".hinge-artifact > div")].map((d) => [
        d.querySelector("dt").innerText,
        d.querySelector("dd").innerText,
      ]);
      const overflowing = [...li.querySelectorAll("p, dd, dt, h3, div")]
        .filter((el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
        .map((el) => el.className || el.tagName);
      const weight = getComputedStyle(li.querySelector(".hinge-weight"));
      return {
        li: box(li),
        parts,
        artifactRows,
        overflowing,
        weightCentre: (parts.weight.t + parts.weight.b) / 2,
        verbLineMid,
        segment:
          before.display === "none"
            ? null
            : {
                top: segTop,
                bottom: segBottom,
                width: before.width,
                paint: before.backgroundImage !== "none" ? "dashed" : before.backgroundColor,
              },
        weightStyle: { bg: weight.backgroundColor, border: weight.borderTopWidth, size: weight.width },
      };
    });
    const overlaps = [];
    for (let i = 0; i < passes.length; i++)
      for (let j = i + 1; j < passes.length; j++) {
        const a = passes[i].li;
        const b = passes[j].li;
        if (a.b > b.t + 0.5 && b.b > a.t + 0.5 && a.r > b.l && b.r > a.l) overlaps.push([i + 1, j + 1]);
      }
    const partOverlaps = [];
    passes.forEach((p, i) => {
      const names = ["number", "verb", "text", "status", "artifact"];
      for (let a = 0; a < names.length; a++)
        for (let b = a + 1; b < names.length; b++) {
          const A = p.parts[names[a]];
          const B = p.parts[names[b]];
          if (A.r > B.l + 0.5 && B.r > A.l + 0.5 && A.b > B.t + 0.5 && B.b > A.t + 0.5)
            partOverlaps.push(`${i + 1}:${names[a]}/${names[b]}`);
        }
    });
    const hang = box(sec.querySelector(".hinge-hang"));
    const board = box(sec.querySelector(".hinge-board"));
    const h2 = sec.querySelector("h2");
    const h2s = getComputedStyle(h2);
    const lede = sec.querySelector(".hinge-head .lede");
    const all = [...sec.querySelectorAll("*")].map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0);
    return {
      vw: document.documentElement.clientWidth,
      scrollW: document.documentElement.scrollWidth,
      section: box(sec),
      board,
      hangWidth: getComputedStyle(sec.querySelector(".hinge-hang")).width,
      hangMeetsBoard: Math.round((hang.t - board.b) * 10) / 10,
      hangMeetsFirstWeight: Math.round((hang.b - passes[0].weightCentre) * 10) / 10,
      hangX: Math.round(((hang.l + hang.r) / 2) * 10) / 10,
      weightX: passes.map((p) => Math.round(((p.parts.weight.l + p.parts.weight.r) / 2) * 10) / 10),
      h2: { size: h2s.fontSize, wdth: h2s.fontVariationSettings, lines: Math.round(h2.getBoundingClientRect().height / lh(h2)), left: Math.round(h2.getBoundingClientRect().left) },
      ledeLines: Math.round(lede.getBoundingClientRect().height / lh(lede)),
      passes: passes.map((p, i) => ({
        n: i + 1,
        top: Math.round(p.li.t),
        height: Math.round(p.li.h),
        weightOffVerb: Math.round((p.weightCentre - p.verbLineMid) * 10) / 10,
        segToNext:
          p.segment && passes[i + 1]
            ? {
                fromWeight: Math.round((p.segment.top - p.weightCentre) * 10) / 10,
                toNextWeight: Math.round((p.segment.bottom - passes[i + 1].weightCentre) * 10) / 10,
                width: p.segment.width,
                paint: p.segment.paint,
              }
            : null,
        weight: p.weightStyle,
        text: [Math.round(p.parts.text.l), Math.round(p.parts.text.r)],
        artifact: [Math.round(p.parts.artifact.l), Math.round(p.parts.artifact.r), Math.round(p.parts.artifact.t - p.parts.verb.t)],
        artifactRows: p.artifactRows,
        overflowing: p.overflowing,
      })),
      overlaps,
      partOverlaps,
      maxRight: Math.round(Math.max(...all.map((b) => b.right))),
      minLeft: Math.round(Math.min(...all.map((b) => b.left))),
    };
  });
  const edge = evidence.relationships.find((x) => x.id === evidence.realEdge);
  const sym = (id) => evidence.symbols.find((s) => s.id === id);
  const base = (p) => p.slice(p.lastIndexOf("/") + 1);
  const expected = {
    1: [
      ["file", base(evidence.dependency.path)],
      ["symbols", String(evidence.dependency.symbolCount)],
      [sym(edge.target).kind, sym(edge.target).name],
    ],
    2: [
      ["edge", edge.kind],
      ["from", sym(edge.source).name],
      ["to", sym(edge.target).name],
      ["at", `${base(edge.provenance[0].file)}:${edge.provenance[0].line}`],
    ],
  };
  r.expected = expected;
  r.artifactsMatchEvidence = [1, 2].every(
    (n) => JSON.stringify(r.passes[n - 1].artifactRows) === JSON.stringify(expected[n]),
  );
  r.errors = errors;
  report[`${w}x${h}`] = r;
  const top = await page.evaluate(() => document.querySelector("#how-it-works").getBoundingClientRect().top + scrollY);
  const height = await page.evaluate(() => document.querySelector("#how-it-works").getBoundingClientRect().height);
  await page.screenshot({
    path: `${out}/hinge-${w}x${h}.png`,
    fullPage: true,
    clip: { x: 0, y: Math.max(0, top - 40), width: w, height: Math.min(height + 80, 7000) },
  });
  await ctx.close();
}
writeFileSync(`${out}/hinge.json`, JSON.stringify(report, null, 1));
for (const [k, r] of Object.entries(report)) {
  const vh = Number(k.split("x")[1]);
  console.log(
    `${k}: section ${Math.round(r.section.h)}px (${(r.section.h / vh).toFixed(2)} vh) h2 ${r.h2.size} ${r.h2.wdth} ${r.h2.lines}L @${r.h2.left} lede ${r.ledeLines}L overlaps ${JSON.stringify(r.overlaps)} parts ${JSON.stringify(r.partOverlaps)} scrollW ${r.scrollW}/${r.vw} span ${r.minLeft}..${r.maxRight} hang ${r.hangWidth} ->board ${r.hangMeetsBoard} ->w1 ${r.hangMeetsFirstWeight} x ${r.hangX} weights x ${r.weightX.join(",")} evidence ${r.artifactsMatchEvidence} errors ${r.errors.length}`,
  );
  for (const p of r.passes)
    console.log(
      `   ${p.n} h${p.height} weight ${p.weight.size}/${p.weight.border} offVerb ${p.weightOffVerb} seg ${JSON.stringify(p.segToNext)} text ${p.text} art ${p.artifact} ovf ${JSON.stringify(p.overflowing)}`,
    );
}
await browser.close();
