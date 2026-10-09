// Key plan framing trials: planCamera's numbers at several distances and target heights, 1.6 and 1.0 aspects.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForTimeout(3000);
const trials = JSON.parse(process.argv[2] ?? '[[58,0.35,28],[48,0.35,28],[44,0.3,28],[44,0.22,28]]');
await page.evaluate((trials) => {
  const still = window.__kfilm;
  const Fallback = still.fallback.constructor;
  const model = still.model;
  const H = model.maxLevel * 1.1;
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:fixed;inset:0;z-index:99;background:#202326;display:grid;grid-template-columns:repeat(2, 1fr);gap:8px;padding:8px;align-content:start";
  document.body.append(wrap);
  for (const [dist, ty, fov, pitchArg] of trials) {
    for (const [w, h] of [[480, 300], [300, 300]]) {
      const holder = document.createElement("div");
      holder.style.cssText = `width:${w}px;height:${h}px;background:#0e1012;position:relative`;
      const label = document.createElement("span");
      label.textContent = `d ${dist} ty ${ty} fov ${fov}`;
      label.style.cssText = "position:absolute;left:4px;top:2px;font:11px monospace;color:#8b8e92";
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "width:100%;height:100%;display:block";
      holder.append(canvas, label);
      wrap.append(holder);
      const pitch = pitchArg ?? 1.18;
      const target = [0, H * ty, 0];
      const cam = { eye: [0, target[1] + dist * Math.sin(pitch), dist * Math.cos(pitch)], target, fov, lensX: 0, lensY: 0 };
      const key = new Fallback(canvas, model, w / h >= 0.95 ? "wide" : "tall");
      key.resize(w, h, 1, w / h >= 0.95 ? "wide" : "tall");
      key.setCamera(cam);
      key.draw(null);
    }
  }
}, trials);
await page.waitForTimeout(300);
await page.screenshot({ path: "cap/keyplan2.png" });
await browser.close();
