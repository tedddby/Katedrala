// The film's clock, checked in the page (the real module): actAt(P) contiguous and monotone over [0, 1], and the
// round trip progressOf(actAt(P)) == P, for both framings; prints the act table and the anchors.
// usage: node clock.mjs
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const out = {};
for (const [w, h] of [
  [1440, 900],
  [390, 844],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
  await page.waitForFunction(() => window.__kfilm?.clock !== undefined, null, { timeout: 30000 });
  out[`${w}x${h}`] = await page.evaluate(() => {
    const clock = window.__kfilm.clock;
    const N = 20000;
    let prev = null;
    let monotone = true;
    let contiguous = true;
    let maxRoundTrip = 0;
    const firsts = [];
    for (let i = 0; i <= N; i++) {
      const P = i / N;
      const a = clock.at(P, { index: 0, id: "hang", t: 0 });
      const back = clock.progressOf(a.index, a.t);
      maxRoundTrip = Math.max(maxRoundTrip, Math.abs(back - P));
      if (prev !== null) {
        if (a.index < prev.index || (a.index === prev.index && a.t < prev.t - 1e-12)) monotone = false;
        if (a.index === prev.index + 1) {
          firsts.push({ P: +P.toFixed(5), from: `${prev.id} ${prev.t.toFixed(5)}`, to: `${a.id} ${a.t.toFixed(5)}` });
          // Across a boundary the previous act ends within one step of t 1 and the next starts within one of t 0.
          const step = 1 / N;
          const prevSpan = clock.spans[prev.index];
          const nextSpan = clock.spans[a.index];
          if (1 - prev.t > (step * clock.length) / prevSpan.length + 1e-9) contiguous = false;
          if (a.t > (step * clock.length) / nextSpan.length + 1e-9) contiguous = false;
        } else if (a.index > prev.index + 1) contiguous = false;
      }
      prev = a;
    }
    return {
      length: +clock.length.toFixed(4),
      track: +(clock.length + 1).toFixed(4),
      spans: clock.spans.map((s) => ({ id: s.id, from: +s.from.toFixed(4), to: +s.to.toFixed(4), P: [+(s.from / clock.length).toFixed(4), +(s.to / clock.length).toFixed(4)] })),
      anchors: clock.spans.map((s, i) => ({ id: s.id, viewports: +clock.anchorOf(i).toFixed(4) })),
      stops: clock.stops.map((s) => +s.toFixed(4)),
      monotone,
      contiguous,
      maxRoundTrip,
      boundaries: firsts,
      end: clock.at(1, { index: 0, id: "hang", t: 0 }),
      start: clock.at(0, { index: 0, id: "hang", t: 0 }),
    };
  });
  await page.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
