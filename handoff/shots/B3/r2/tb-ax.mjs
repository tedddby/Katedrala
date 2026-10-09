// How a title block reads: Playwright's aria snapshot, innerText, and Chrome's accessibility tree (CDP), for the
// kit's TitleBlock (/lab/kit/) and the film's own title block (/lab/promoted/).
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const cdp = await page.context().newCDPSession(page);
for (const [url, sel] of [["http://localhost:3100/lab/kit/", "p.titleblock"], ["http://localhost:3100/lab/promoted/", "[data-film-titleblock]"]]) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const loc = page.locator(sel).first();
  console.log(`== ${url} ${sel}`);
  console.log("innerText:", JSON.stringify(await loc.innerText()));
  console.log("textContent:", JSON.stringify(await loc.evaluate((el) => el.textContent)));
  console.log("aria:", await loc.ariaSnapshot());
  // Chrome's tree for the paragraph: its static text children.
  await loc.evaluate((el) => (el.id ||= "tb-probe"));
  const id = await loc.evaluate((el) => el.id);
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `#${id}` });
  const { nodes } = await cdp.send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
  const all = await cdp.send("Accessibility.getFullAXTree");
  const byId = new Map(all.nodes.map((n) => [n.nodeId, n]));
  const start = all.nodes.find((n) => n.backendDOMNodeId === nodes[0].backendDOMNodeId);
  const walk = (n, d) => {
    if (!n) return;
    const name = n.name?.value ?? "";
    if (!n.ignored) console.log(`${"  ".repeat(d)}${n.role?.value} ${JSON.stringify(name)}`);
    for (const c of n.childIds ?? []) walk(byId.get(c), d + (n.ignored ? 0 : 1));
  };
  walk(start, 0);
}
await browser.close();
