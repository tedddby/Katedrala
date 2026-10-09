// The camera at the act boundaries: eye and target just before and just after each boundary (P +- 1e-6), and the
// largest step between consecutive samples across the whole track (a cut would show as an outlier).
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
  await page.waitForFunction(() => window.__kfilm?.camTrack, null, { timeout: 60000 });
  const r = await page.evaluate(() => {
    const f = window.__kfilm;
    const cam = (P) => { const c = f.cameraAt(P); return [...c.eye, ...c.target, c.fov, c.lensX, c.lensY]; };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3], a[4] - b[4], a[5] - b[5]);
    const out = [];
    for (let i = 1; i < f.clock.spans.length; i++) {
      const P = f.clock.spans[i].from / f.clock.length;
      out.push({ boundary: `${f.clock.spans[i - 1].id}|${f.clock.spans[i].id}`, P: +P.toFixed(5), jump: dist(cam(P - 1e-6), cam(P + 1e-6)) });
    }
    let maxStep = 0, at = 0, prev = cam(0);
    const N = 20000;
    const steps = [];
    for (let k = 1; k <= N; k++) { const c = cam(k / N); const d = dist(prev, c); steps.push(d); if (d > maxStep) { maxStep = d; at = k / N; } prev = c; }
    steps.sort((a, b) => a - b);
    return { boundaries: out, maxStep: +maxStep.toFixed(4), maxAt: +at.toFixed(4), medianStep: +steps[N / 2].toFixed(5) };
  });
  console.log(`${w}x${h}`, JSON.stringify(r));
  await page.close();
}
await browser.close();
