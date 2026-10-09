// Measures, inside the page, how long chain motion runs after an input: from the click event to the last
// mutation of a chain's shape or opacity. Usage: node timing.mjs <width> <section> <selector-to-click> [nth]...
import { VIEWPORTS, launch, open, scrollTo } from "./lib.mjs";

export async function installTimer(page, scope) {
  await page.evaluate((scope) => {
    const root = document.querySelector(scope);
    window.__chain = { input: 0, last: 0, mutations: 0 };
    root.addEventListener("click", () => {
      window.__chain.input = performance.now();
      window.__chain.last = 0;
      window.__chain.mutations = 0;
    }, true);
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target;
        if (el.closest?.(".chain") || el.classList?.contains("chain")) {
          window.__chain.last = performance.now();
          window.__chain.mutations += 1;
        }
      }
    }).observe(root, { subtree: true, attributes: true, attributeFilter: ["d", "style"] });
  }, scope);
}

export async function measure(page, action) {
  await action();
  // Wait until nothing has moved for 400 ms.
  await page.waitForFunction(() => window.__chain.last > 0 && performance.now() - window.__chain.last > 400, null, { timeout: 5000 }).catch(() => {});
  return page.evaluate(() => ({ ms: Math.round(window.__chain.last - window.__chain.input), mutations: window.__chain.mutations }));
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const [w, section, selector, ...nths] = process.argv.slice(2);
  const browser = await launch();
  const { page, context } = await open(browser, VIEWPORTS[w]);
  await scrollTo(page, `#${section}`, 0);
  await page.waitForTimeout(300);
  await installTimer(page, `#${section}`);
  for (const nth of nths.length ? nths : ["0"]) {
    const target = page.locator(`#${section} ${selector}`).nth(Number(nth));
    await target.scrollIntoViewIfNeeded();
    const result = await measure(page, () => target.click());
    console.log(w, section, selector, nth, result);
  }
  await context.close();
  await browser.close();
}
