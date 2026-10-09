(() => {
  const out = [];
  for (const c of document.querySelectorAll('[data-caption]')) {
    const t = c.querySelector('p');
    const clone = t.cloneNode(true);
    clone.style.cssText = 'position:absolute;white-space:nowrap;width:auto;visibility:hidden;left:0;top:0';
    document.body.append(clone);
    const fs = getComputedStyle(t).fontSize;
    out.push([c.dataset.caption, Math.round(clone.getBoundingClientRect().width), fs, Math.round(c.getBoundingClientRect().width)]);
    clone.remove();
  }
  return out;
})()
