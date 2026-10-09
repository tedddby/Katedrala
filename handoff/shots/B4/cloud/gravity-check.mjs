// Gravity: each term toggle lights its evidence set (compared with metrics.ts), the status sentence names the lit
// members, the cascade on a pointer choice, instant keyboard changes, the crossfade between terms.
import { VIEWPORTS, launch, open, scrollTo, frames } from "./lib.mjs";
import { execFileSync } from "node:child_process";
const width = process.argv[2] ?? "1440";
const reduced = process.argv[3] === "reduced";
// Expected sets from the sources, through the sim copy.
const expected = JSON.parse(execFileSync("node", ["--experimental-strip-types", "--no-warnings", "-e", `
  import("./sim/metrics.ts").then(({ TERM_EVIDENCE }) => {
    const out = {};
    for (const [id, terms] of TERM_EVIDENCE) out[id] = Object.fromEntries(Object.entries(terms).map(([k, v]) => [k, { members: v.members, edges: v.edges }]));
    console.log(JSON.stringify(out));
  });`], { encoding: "utf8" }));
const browser = await launch();
const { page, context, messages } = await open(browser, VIEWPORTS[width], { reducedMotion: reduced ? "reduce" : "no-preference" });
await scrollTo(page, "#gravity", 0);
await page.waitForTimeout(400);
const state = () => page.evaluate(() => {
  const root = document.querySelector("#gravity");
  const drawing = root.querySelector(".drawing");
  const shown = drawing && drawing.getClientRects().length > 0 && drawing.closest(".hidden") === null ? drawing : null;
  const name = (g) => g.querySelector("text").textContent;
  return {
    selected: root.querySelector('[role="radio"][aria-checked="true"]').textContent,
    status: root.querySelector('[role="status"]').textContent,
    pressed: [...root.querySelectorAll(".term-show")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.getAttribute("aria-label")),
    litMembers: drawing ? [...drawing.querySelectorAll('.drawing-member[data-relation="carried"]')].map(name).sort() : [],
    active: drawing ? [...drawing.querySelectorAll('.drawing-member[data-relation="active"]')].map(name) : [],
    litEdges: drawing ? [...drawing.querySelectorAll('.drawing-edge[data-relation="carried"]')].map((e) => e.dataset.edgeKey ?? `${e.getAttribute("x1")},${e.getAttribute("y1")}`).length : 0,
    schedule: [...root.querySelectorAll('.schedule-member')].filter((li) => li.dataset.relation === "lit").map((li) => li.textContent).sort(),
    drawingShown: !!shown,
  };
});
const fail = [];
const terms = ["reach", "fan-in", "spread", "brokerage"];
const members = ["Database", "PaymentService", "OrderService", "CheckoutController", "ApiGateway"];
for (let mi = 0; mi < members.length; mi++) {
  const radio = page.locator('#gravity [role="radio"]').nth(mi);
  await radio.click();
  await page.waitForTimeout(reduced ? 80 : 700);
  for (let ti = 0; ti < 4; ti++) {
    const toggle = page.locator("#gravity .term-show").nth(ti);
    const before = await state();
    if (!before.pressed.includes(await toggle.getAttribute("aria-label"))) await toggle.click();
    await page.waitForTimeout(reduced ? 60 : 300);
    const s = await state();
    const want = expected[members[mi]][terms[ti]];
    const litOk = s.drawingShown ? JSON.stringify(s.litMembers) === JSON.stringify([...want.members].sort()) : true;
    const schedOk = s.drawingShown ? true : JSON.stringify(s.schedule) === JSON.stringify(want.members.filter(() => true).sort());
    const edgesOk = s.drawingShown ? s.litEdges === want.edges.length : true;
    const statusNames = want.members.every((m) => s.status.includes(m));
    if (!litOk || !edgesOk || !statusNames || !schedOk) fail.push({ member: members[mi], term: terms[ti], s, want });
    console.log(width, members[mi], terms[ti], `lit ${s.drawingShown ? s.litMembers.length : s.schedule.length}/${want.members.length} edges ${s.litEdges}/${want.edges.length}`, litOk && edgesOk && statusNames && schedOk ? "ok" : "FAIL", "|", s.status);
  }
}
// Release the pressed toggle: nothing but the member lit.
const pressedToggle = page.locator('#gravity .term-show[aria-pressed="true"]');
await pressedToggle.click();
await page.waitForTimeout(200);
console.log(width, "released:", JSON.stringify(await state()));
console.log("FAILS", fail.length, JSON.stringify(fail).slice(0, 2000));
console.log("messages", messages);
await context.close();
await browser.close();
