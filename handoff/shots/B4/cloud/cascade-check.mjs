// Gravity: samples, every frame after an input, the opacity of every lit member and dependency in the drawing, and
// reports when each load level reached full brightness (the cascade), or that everything landed at once.
import { VIEWPORTS, launch, open, scrollTo } from "./lib.mjs";
const width = process.argv[2] ?? "1440";
const reduced = process.argv[3] === "reduced";
const browser = await launch();
const { page, context, messages } = await open(browser, VIEWPORTS[width], { reducedMotion: reduced ? "reduce" : "no-preference" });
await scrollTo(page, "#gravity", 0);
await page.waitForTimeout(500);
async function sample(label, action, ms = 900) {
  await page.evaluate(() => {
    window.__s = [];
    window.__t0 = 0;
    const root = document.querySelector("#gravity");
    root.addEventListener("click", () => (window.__t0 = performance.now()), { capture: true, once: true });
    root.addEventListener("keydown", () => (window.__t0 = performance.now()), { capture: true, once: true });
    const tick = (t) => {
      const d = root.querySelector(".drawing");
      const row = { t, m: {}, e: 0, eFull: 0 };
      for (const g of d.querySelectorAll(".drawing-member")) {
        if (g.dataset.relation === "carried" || g.dataset.relation === "active") row.m[g.querySelector("text").textContent] = +getComputedStyle(g).opacity;
      }
      const lit = [...d.querySelectorAll('.drawing-edge[data-relation="carried"]')];
      row.e = lit.length;
      row.eFull = lit.filter((e) => +getComputedStyle(e).opacity > 0.98).length;
      window.__s.push(row);
      if (t - (window.__t0 || t) < 1200 && window.__s.length < 400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await action();
  await page.waitForTimeout(ms);
  const r = await page.evaluate(() => {
    const s = window.__s.filter((row) => row.t >= window.__t0);
    const levelOf = {};
    for (const g of document.querySelectorAll("#gravity .drawing-member")) {
      const y = g.transform.baseVal.consolidate()?.matrix.f ?? 0;
      levelOf[g.querySelector("text").textContent] = Math.round(y);
    }
    const full = {};
    for (const row of s) for (const [id, o] of Object.entries(row.m)) if (o > 0.98 && full[id] === undefined) full[id] = Math.round(row.t - window.__t0);
    const allEdges = s.find((row) => row.e > 0 && row.eFull === row.e);
    return { full, edgesFullAt: allEdges ? Math.round(allEdges.t - window.__t0) : null, frames: s.length, ys: levelOf };
  });
  // Group by y (level) to show the order.
  const byLevel = {};
  for (const [id, t] of Object.entries(r.full)) (byLevel[r.ys[id]] ??= []).push(`${id}@${t}`);
  console.log(width, reduced ? "reduced" : "motion", label, "edges lit at", r.edgesFullAt, "ms");
  for (const y of Object.keys(byLevel).map(Number).sort((a, b) => a - b)) console.log("    y", y, byLevel[y].join(" "));
}
const radios = page.locator('#gravity [role="radio"]');
await sample("pointer: PaymentService", () => radios.nth(1).click());
await sample("pointer: Database", () => radios.nth(0).click());
await sample("keyboard: ArrowRight to PaymentService", async () => { await radios.nth(0).focus(); await page.keyboard.press("ArrowRight"); });
await sample("pointer: toggle fan-in (crossfade)", () => page.locator("#gravity .term-show").nth(1).click());
await sample("keyboard: toggle reach (Enter)", async () => { await page.locator("#gravity .term-show").nth(0).focus(); await page.keyboard.press("Enter"); });
console.log("messages", messages);
await context.close(); await browser.close();
