import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
const info = await page.evaluate(() => {
  const out = {};
  out.bodyChildren = [...document.body.children].map((e) => `${e.tagName.toLowerCase()}#${e.id}.${[...e.classList].join(".")}`);
  out.mainChildren = [...document.querySelector("main").children].map((e) => `${e.tagName.toLowerCase()}#${e.id}.${[...e.classList].join(".")}`);
  out.allIds = [...document.querySelectorAll("[id]")].map((e) => `${e.tagName.toLowerCase()}#${e.id}`);
  out.header = document.querySelector("header")?.outerHTML.slice(0, 1500);
  out.htmlAttrs = [...document.documentElement.attributes].map((a) => `${a.name}=${a.value}`);
  out.title = document.title;
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
