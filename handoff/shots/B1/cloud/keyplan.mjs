// The key plan B5 will draw through stage/fallback.ts: the still layout's hero Fallback, re-aimed with planCamera's
// numbers (timeline.ts), drawn into its canvas at a key-plan size, captured.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForTimeout(3000);
const r = await page.evaluate(async () => {
  const still = window.__kfilm;
  const fb = still.fallback;
  const model = still.model;
  const H = model.maxLevel * 1.1;
  const pitch = 1.18, dist = 44;
  const target = [0, H * 0.3, 0];
  const cam = { eye: [target[0], target[1] + dist * Math.sin(pitch), target[2] + dist * Math.cos(pitch)], target, fov: 28, lensX: 0, lensY: 0 };
  // A separate canvas the size of a key plan, so the hero is left alone.
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:20px;top:80px;width:560px;height:360px;z-index:99;background:#0e1012;outline:1px solid #353a3f";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;height:100%;display:block";
  holder.append(canvas);
  document.body.append(holder);
  const Fallback = fb.constructor;
  const key = new Fallback(canvas, model, "wide");
  key.resize(560, 360, 2, "wide");
  key.setCamera(cam);
  key.draw(null);
  return { drawn: key.drawn, w: canvas.width, h: canvas.height };
});
console.log(JSON.stringify(r));
await page.screenshot({ path: "cap/keyplan.png", clip: { x: 0, y: 60, width: 620, height: 420 } });
await browser.close();
