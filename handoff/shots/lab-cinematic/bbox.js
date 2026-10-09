(() => {
  const film = window.__kfilm; const st = film.stage; const m = film.model;
  const pt = { x: 0, y: 0, depth: 0, visible: false };
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let v = 0; v < m.n; v++) { st.screenOf(v, pt); x0 = Math.min(x0, pt.x); x1 = Math.max(x1, pt.x); y0 = Math.min(y0, pt.y); y1 = Math.max(y1, pt.y); }
  let gx0 = 1e9, gx1 = -1e9, gy0 = 1e9, gy1 = -1e9;
  for (let i = 0; i < 96; i++) { const t = i / 96 * Math.PI * 2; for (const y of [0, -0.62]) { st.screenOfWorld(Math.cos(t) * 11 * 1.145, y, Math.sin(t) * 7.4 * 1.145, pt); gx0 = Math.min(gx0, pt.x); gx1 = Math.max(gx1, pt.x); gy0 = Math.min(gy0, pt.y); gy1 = Math.max(gy1, pt.y); } }
  const tb = document.querySelector('[data-film-titleblock]').getBoundingClientRect();
  const hero = document.querySelector('[data-film-hero]').getBoundingClientRect();
  const r = (a) => a.map((v) => Math.round(v));
  return { nodes: r([x0, y0, x1, y1]), ground: r([gx0, gy0, gx1, gy1]), titleblock: r([tb.left, tb.top, tb.right, tb.bottom]), hero: r([hero.left, hero.top, hero.right, hero.bottom]), vw: innerWidth, vh: innerHeight };
})()
