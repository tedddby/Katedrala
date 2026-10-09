// Explorer, Members view: which dependencies run through which member names (and bay names), measured on screen.
import { VIEWPORTS, launch, open, scrollTo, frames } from "./lib.mjs";

export async function crossings(page) {
  return page.evaluate(() => {
    const svg = document.querySelector("#architecture .explorer-sheet > svg");
    const labels = [...svg.querySelectorAll(".plan-member")]
      .filter((g) => g.dataset.collapsed !== "true")
      .map((g) => {
        const t = g.querySelector(".plan-label");
        const r = t.getBoundingClientRect();
        return { name: t.textContent, l: r.left, r: r.right, t: r.top, b: r.bottom };
      });
    const bays = [...svg.querySelectorAll(".plan-bay-label")].map((t) => {
      const r = t.getBoundingClientRect();
      return { name: t.textContent, l: r.left, r: r.right, t: r.top, b: r.bottom };
    });
    const paths = [...svg.querySelectorAll(".plan-edges path.plan-edge")];
    const hits = [];
    for (const p of paths) {
      const g = p.closest(".chain");
      if (g && g.dataset.present === "false") continue;
      const m = p.getScreenCTM();
      const len = p.getTotalLength();
      const name = p.dataset.edge ?? p.getAttribute("d").slice(0, 20);
      const crossed = new Map();
      for (let i = 1; i < 200; i++) {
        const pt = p.getPointAtLength((len * i) / 200);
        const x = m.a * pt.x + m.c * pt.y + m.e;
        const y = m.b * pt.x + m.d * pt.y + m.f;
        for (const box of [...labels, ...bays]) {
          // Half a pixel of tolerance: a line that only grazes a glyph box is not through the name.
          if (x > box.l + 0.5 && x < box.r - 0.5 && y > box.t + 0.5 && y < box.b - 0.5) crossed.set(box.name, (crossed.get(box.name) ?? 0) + 1);
        }
      }
      for (const [box, n] of crossed) hits.push(`${name} through ${box} (${n} samples)`);
    }
    return hits;
  });
}

if (import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const browser = await launch();
  for (const w of (process.argv[2] ?? "1440,1024,768").split(",")) {
    const vp = VIEWPORTS[w] ?? { width: Number(w), height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
    const { page, context } = await open(browser, vp);
    await scrollTo(page, "#architecture", 0);
    // Members view.
    const members = page.locator('#architecture [role="radio"][data-mode="members"]');
    if ((await members.getAttribute("aria-checked")) !== "true") await members.click();
    await page.waitForTimeout(700);
    await frames(page, 2);
    const hits = await crossings(page);
    console.log(w, hits.length, "crossings");
    for (const h of hits) console.log("   ", h);
    await context.close();
  }
  await browser.close();
}
