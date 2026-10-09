/**
 * The film's ties to the page around it: its two in-page links and the navigation's ground.
 *
 * The film's two in-page links, followed natively (the hash, the focus starting point and the history stay the
 * browser's) with the scroll they need:
 * - "Explore Katedrala" (href #film-start) plays the film: a short smooth scroll to its first caption while the film
 *   runs, an instant jump in the still layout.
 * - "Skip the film" ([data-film-skip], wherever it is on the page) jumps past it at once: a smooth scroll through a
 *   pinned film would play the whole film at speed.
 * The root's scroll behaviour is set for the one navigation and restored on the next frame (a smooth scroll that
 * has started keeps going).
 */
export function bindFilmLinks(root: HTMLElement, mode: () => "film" | "still"): () => void {
  const html = document.documentElement;
  let restore = 0;
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    const link = (e.target as Element | null)?.closest<HTMLAnchorElement>("a[href^='#']");
    if (link === null || link === undefined) return;
    const href = link.getAttribute("href") ?? "";
    let behavior: "smooth" | "auto" | null = null;
    if (link.hasAttribute("data-film-skip")) behavior = "auto";
    else if (href === "#film-start" && root.contains(link))
      behavior = mode() === "film" ? "smooth" : "auto";
    if (behavior === null) return;
    html.style.scrollBehavior = behavior;
    cancelAnimationFrame(restore);
    restore = requestAnimationFrame(() => {
      html.style.removeProperty("scroll-behavior");
    });
  };
  document.addEventListener("click", onClick);
  return () => {
    document.removeEventListener("click", onClick);
    cancelAnimationFrame(restore);
    html.style.removeProperty("scroll-behavior");
  };
}

/**
 * Keeps <html data-kfilm-under> while the top of the film's frame lies under the navigation bar: the frame then fills
 * the window from the bar down (the film is pinned, or the page is at its top), so the navigation can stay clear over
 * the drawing. Once the frame starts to scroll away (the film is over), or before it arrives, the bar takes its own
 * ground, so the next section never slides under clear lettering. The same in the still layout, over its hero frame.
 */
export function bindNavigationMark(frame: HTMLElement): () => void {
  const html = document.documentElement;
  // A one-pixel mark on the frame's top edge, watched through a band across the top of the window.
  const mark = document.createElement("div");
  mark.setAttribute("aria-hidden", "true");
  mark.style.cssText = "position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none";
  frame.prepend(mark);
  // A note for the mode script: a reload, back or forward restores this scroll position, and the bar's ground is
  // right from the first frame (mode.ts reads it).
  const key = `kfilm-under:${location.pathname}`;
  const io = new IntersectionObserver(
    (entries) => {
      const under = entries.some((e) => e.isIntersecting);
      if (under) html.dataset.kfilmUnder = "";
      else delete html.dataset.kfilmUnder;
      try {
        sessionStorage.setItem(key, under ? "1" : "0");
      } catch {
        // Storage refused: the mode script waits for the first frame instead.
      }
    },
    // The band: about as deep as the bar.
    { rootMargin: "0px 0px -92% 0px" },
  );
  io.observe(mark);
  return () => {
    io.disconnect();
    mark.remove();
    delete html.dataset.kfilmUnder;
  };
}
