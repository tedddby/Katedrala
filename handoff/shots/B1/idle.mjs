// Idle and offscreen frames: after scrolling to a point and letting the film settle, counts the director's ticks
// and the stage's drawn frames over two quiet seconds; then scrolls the film off screen and counts again.
// usage: node idle.mjs <W>x<H> <P1,P2,...>   (global progress)
import { chromium } from "playwright-core";
const [size, list] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width, height } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined && window.__kfilm?.trigger, null, { timeout: 30000 });
await page.waitForTimeout(3000);
const count = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const film = window.__kfilm;
        const tick = film.tick;
        const frame = film.stage.frame.bind(film.stage);
        let ticks = 0;
        let drawn = 0;
        film.tick = (now) => {
          ticks++;
          tick(now);
        };
        film.stage.frame = (s) => {
          const d = frame(s);
          if (d) drawn++;
          return d;
        };
        setTimeout(() => {
          film.tick = tick;
          film.stage.frame = frame;
          res({ ticks, drawn, raf: film.raf });
        }, 2000);
      }),
  );
const out = [];
for (const P of list.split(",").map(Number)) {
  await page.evaluate((P) => {
    const track = document.querySelector("[data-film-track]");
    const top = track.getBoundingClientRect().top + scrollY;
    window.scrollTo({ top: top + P * (track.offsetHeight - innerHeight), behavior: "instant" });
  }, P);
  await page.waitForTimeout(3500);
  out.push({ P, ...(await count()), at: await page.evaluate(() => `${window.__kfilm.pos.id} ${window.__kfilm.pos.t.toFixed(3)}`) });
}
// Off screen: past the end of the film.
await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
await page.waitForTimeout(2500);
out.push({ offscreen: true, ...(await count()) });
console.log(JSON.stringify(out));
await browser.close();
