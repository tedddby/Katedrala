// Name widths in em (getBBox width / font size) for member names (Archivo, plan-label) and bay names (Martian
// Mono capitals) as the explorer sets them, plus the glyph box's top and height relative to the baseline.
import { VIEWPORTS, launch, open, scrollTo } from "./lib.mjs";
const browser = await launch();
const { page, context } = await open(browser, VIEWPORTS[1440]);
await scrollTo(page, "#architecture", 0);
await page.waitForTimeout(500);
const out = await page.evaluate(() => {
  const svg = document.querySelector("#architecture .explorer-sheet > svg");
  const ns = "http://www.w3.org/2000/svg";
  const g = document.createElementNS(ns, "g");
  g.setAttribute("class", "plan-member");
  svg.appendChild(g);
  const t = document.createElementNS(ns, "text");
  t.setAttribute("class", "plan-label");
  t.setAttribute("y", "0");
  g.appendChild(t);
  const res = {};
  for (const name of ["ApiGateway","CheckoutController","CheckoutService","OrderController","OrderService","OrderRepository","AuthService","SessionStore","InvoiceService","PaymentService","PaymentRepository","StripeClient","UserService","UserRepository","Database","EventBus"]) {
    t.textContent = name;
    const fs = parseFloat(getComputedStyle(t).fontSize);
    const b = t.getBBox();
    res[name] = { em: +(b.width / fs).toFixed(4), top: +(b.y / fs).toFixed(4), h: +(b.height / fs).toFixed(4) };
  }
  g.remove();
  const bayT = svg.querySelector(".plan-bay-label");
  const fsb = parseFloat(getComputedStyle(bayT).fontSize);
  const bb = bayT.getBBox();
  return { members: res, bay: { em: +(bb.width / fsb / bayT.textContent.length).toFixed(4), h: +(bb.height / fsb).toFixed(4), text: bayT.textContent, fs: fsb, y: bb.y, attrY: bayT.getAttribute("y"), dy: bayT.getAttribute("dy") } };
});
console.log(JSON.stringify(out, null, 1));
await context.close(); await browser.close();
