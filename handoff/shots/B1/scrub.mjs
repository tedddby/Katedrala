// Frame times while scrubbing the whole film: scrolls from p0 to p1 at a steady speed (the way a wheel or a
// trackpad drives it), records every requestAnimationFrame interval, the film's own CPU time per tick (Film.tick,
// which includes the stage, the DOM choreography and the labels) and long tasks, overall and per beat.
// usage: node scrub.mjs [W]x[H] [seconds] [--dpr n] [--url u] [--runs n]
import { chromium } from "playwright-core";
const [size = "1440x900", secondsArg = "14", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const seconds = Number(secondsArg);
const opt = (name, dflt) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : dflt);
const dpr = Number(opt("--dpr", width < 600 ? 3 : 1));
const url = opt("--url", "http://localhost:3100/lab/cinematic/");
const runs = Number(opt("--runs", 1));
const throttle = Number(opt("--throttle", 1));
const mobile = width < 600;
const all = [];
for (let r = 0; r < runs; r++) {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  if (throttle > 1) { const cdp = await page.context().newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle }); }
  await page.goto(url, { waitUntil: "load" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
  await page.waitForTimeout(3500);
  const result = await page.evaluate(async (seconds) => {
    const film = window.__kfilm;
    const cpu = [];
    const tick = film.tick;
    // Film.tick is an own property (an arrow function): wrap it to time each tick.
    film.tick = (now) => {
      const t = performance.now();
      tick(now);
      cpu.push([t, performance.now() - t, film.p]);
    };
    const longTasks = [];
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTasks.push([e.startTime, e.duration]);
    });
    try {
      po.observe({ type: "longtask", buffered: false });
    } catch {}
    const track = document.querySelector("[data-film-track]");
    const top = track.getBoundingClientRect().top + scrollY;
    // Act I only (the prototype's whole film): from where the stage pins to the end of Act I.
    const g = (x) => film.clock.progressOf(0, x);
    const span = (track.offsetHeight - innerHeight) * g(1);
    const frames = [];
    let running = true;
    const rec = (t) => {
      frames.push([t, film.p]);
      if (running) requestAnimationFrame(rec);
    };
    requestAnimationFrame(rec);
    await new Promise((res) => {
      const start = performance.now();
      const f = (t) => {
        const k = Math.min(1, (t - start) / (seconds * 1000));
        window.scrollTo({ top: top + k * span, behavior: "instant" });
        if (k < 1) requestAnimationFrame(f);
        else setTimeout(res, 600);
      };
      requestAnimationFrame(f);
    });
    running = false;
    po.disconnect();
    film.tick = tick;
    const q = (arr, x) => (arr.length ? +arr[Math.min(arr.length - 1, Math.floor(x * arr.length))].toFixed(2) : null);
    const stats = (lo, hi) => {
      const d = [];
      for (let i = 1; i < frames.length; i++) {
        const p = frames[i][1];
        if (p >= lo && p < hi) d.push(frames[i][0] - frames[i - 1][0]);
      }
      d.sort((a, b) => a - b);
      const c = cpu.filter(([, , p]) => p >= lo && p < hi).map(([, ms]) => ms).sort((a, b) => a - b);
      return {
        frames: d.length,
        median: q(d, 0.5),
        p95: q(d, 0.95),
        max: q(d, 1),
        over20: d.filter((x) => x > 20).length,
        over33: d.filter((x) => x > 33.4).length,
        tickMedian: q(c, 0.5),
        tickP95: q(c, 0.95),
      };
    };
    return {
      all: stats(-1, 2),
      beats: {
        "plan+drop 0-0.27": stats(-1, g(0.27)),
        "hang+circle 0.27-0.555": stats(g(0.27), g(0.555)),
        "freeze+turn 0.555-0.69": stats(g(0.555), g(0.69)),
        "load wave 0.69-0.745": stats(g(0.69), g(0.745)),
        "zoom+climb 0.745-0.895": stats(g(0.745), g(0.895)),
        "land 0.895-1": stats(g(0.895), 2),
      },
      longTasks: longTasks.length,
      longTaskMax: longTasks.length ? Math.round(Math.max(...longTasks.map((x) => x[1]))) : 0,
      dpr: devicePixelRatio,
      stageDpr: film.stage ? film.stage.dpr : null,
    };
  }, seconds);
  const gpu = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
  });
  all.push({ run: r, gpu, size, seconds, throttle, ...result });
  await browser.close();
}
console.log(JSON.stringify(all, null, 1));

