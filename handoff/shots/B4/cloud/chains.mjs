// Chain motion checks on the live page: for an input (pointer or keyboard) on a plate, samples every chain group's
// opacity and its path's bend every frame, and reports: how long until the last chain came to rest after the last
// input, the largest overshoot, whether any chain jumped (a discontinuity) when input arrived mid-motion, and how
// many chains moved. Usage: node chains.mjs [width] [reduced]
import { VIEWPORTS, launch, open, scrollTo, frames } from "./lib.mjs";

const width = process.argv[2] ?? "1440";
const reduced = process.argv[3] === "reduced";
const browser = await launch();
const { page, context, messages } = await open(browser, VIEWPORTS[width], {
  reducedMotion: reduced ? "reduce" : "no-preference",
});

async function startSampling(scope) {
  await page.evaluate((scope) => {
    const root = document.querySelector(scope);
    const groups = [...root.querySelectorAll("g.chain")].filter((g) => g.getClientRects().length > 0);
    const bend = (d) => {
      const n = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
      if (n.length < 4) return 0;
      const [x0, y0] = n;
      const [x1, y1] = n.slice(-2);
      const cs = n.length === 4 ? [[(x0 + x1) / 2, (y0 + y1) / 2]] : n.length === 6 ? [[n[2], n[3]]] : [[n[2], n[3]], [n[4], n[5]]];
      const len = Math.hypot(x1 - x0, y1 - y0) || 1;
      // Signed distance of the control points from the chord.
      return cs.reduce((s, [cx, cy]) => s + ((x1 - x0) * (cy - y0) - (y1 - y0) * (cx - x0)) / len, 0) / cs.length;
    };
    const rest = new Map(groups.map((g) => [g, bend(g.querySelector("path").getAttribute("d"))]));
    window.__samples = [];
    window.__inputs = [];
    window.__stop = false;
    root.addEventListener("click", () => window.__inputs.push(performance.now()), true);
    root.addEventListener("keydown", () => window.__inputs.push(performance.now()), true);
    const tick = (t) => {
      const row = { t, chains: [] };
      groups.forEach((g, i) => {
        const p = g.querySelector("path");
        row.chains.push({ i, present: g.dataset.present, opacity: +getComputedStyle(g).opacity, inline: g.style.opacity !== "", bend: bend(p.getAttribute("d")) - rest.get(g) });
      });
      window.__samples.push(row);
      if (!window.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, scope);
}

async function stopSampling() {
  return page.evaluate(() => {
    window.__stop = true;
    const samples = window.__samples;
    const inputs = window.__inputs;
    const lastInput = inputs.at(-1) ?? 0;
    let lastMotion = 0;
    let moved = new Set();
    let maxJump = 0;
    let maxBend = 0;
    for (let k = 1; k < samples.length; k++) {
      const a = samples[k - 1];
      const b = samples[k];
      b.chains.forEach((c, i) => {
        const p = a.chains[i];
        const changed = Math.abs(c.opacity - p.opacity) > 0.002 || Math.abs(c.bend - p.bend) > 0.05 || c.inline !== p.inline;
        if (changed) {
          lastMotion = b.t;
          moved.add(i);
        }
        // A jump: the bend changes by more than a third of the largest slack in one frame.
        maxJump = Math.max(maxJump, Math.abs(c.bend - p.bend));
        maxBend = Math.max(maxBend, Math.abs(c.bend));
      });
    }
    return {
      inputs: inputs.length,
      settleAfterLastInputMs: lastMotion ? Math.round(lastMotion - lastInput) : 0,
      chainsMoved: moved.size,
      maxBendUnits: +maxBend.toFixed(1),
      maxFrameStepUnits: +maxJump.toFixed(1),
      frames: samples.length,
      // Every chain at rest at the end: inline styles gone.
      inlineLeft: samples.at(-1).chains.filter((c) => c.inline).length,
    };
  });
}

async function run(label, scope, action, wait = 1200) {
  await scrollTo(page, scope, 0);
  await page.waitForTimeout(300);
  await startSampling(scope);
  await action();
  await page.waitForTimeout(wait);
  const r = await stopSampling();
  console.log(width, reduced ? "reduced" : "motion", label, JSON.stringify(r));
}

// Explorer: kinds. Members view first (phones open in modules).
const membersRadio = page.locator('#architecture [role="radio"][data-mode="members"]');
if ((await membersRadio.getAttribute("aria-checked")) !== "true") { await membersRadio.click(); await page.waitForTimeout(800); }
const calls = page.locator('#architecture .kind-toggle').first();
await run("explorer calls off (pointer)", "#architecture", () => calls.click());
await run("explorer calls on (pointer)", "#architecture", () => calls.click());
await run("explorer calls off/on 80 ms apart (pointer)", "#architecture", async () => { await calls.click(); await page.waitForTimeout(80); await calls.click(); });
await run("explorer calls off/on/off 60 ms apart (pointer)", "#architecture", async () => { await calls.click(); await page.waitForTimeout(60); await calls.click(); await page.waitForTimeout(60); await calls.click(); });
await run("explorer calls on (keyboard)", "#architecture", async () => { await calls.focus(); await page.keyboard.press("Enter"); });

// Entropy: commits.
const commits = page.locator("#entropy .commit");
await run("entropy +5 (pointer)", "#entropy", () => commits.nth(5).click());
await run("entropy base (pointer, lift out)", "#entropy", () => commits.nth(0).click());
await run("entropy +3 then base 100 ms apart", "#entropy", async () => { await commits.nth(3).click(); await page.waitForTimeout(100); await commits.nth(0).click(); });
await run("entropy +1 (keyboard arrow)", "#entropy", async () => { await commits.nth(0).focus(); await page.keyboard.press("ArrowDown"); });
await run("entropy base (keyboard arrow)", "#entropy", async () => { await page.keyboard.press("ArrowUp"); });

// Rules: the toggle.
const toggle = page.locator("#rules .rules-toggle");
await run("rules remove (pointer)", "#rules", () => toggle.click());
await run("rules add (pointer)", "#rules", () => toggle.click());
await run("rules remove/add 90 ms apart", "#rules", async () => { await toggle.click(); await page.waitForTimeout(90); await toggle.click(); });
await run("rules remove (keyboard)", "#rules", async () => { await toggle.focus(); await page.keyboard.press("Enter"); });
await run("rules add (keyboard space)", "#rules", async () => { await page.keyboard.press(" "); });
console.log("messages", messages);
await context.close();
await browser.close();
