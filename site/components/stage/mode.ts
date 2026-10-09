/**
 * Whether the film runs ("film": motion allowed and the WebGL 2 API present) or the standing structure is shown
 * still ("still"), decided before the page paints and set on <html data-kfilm> (an element that tolerates attributes
 * React did not render), so the layout never changes under the visitor. Also marks the film as under the navigation
 * at first paint (<html data-kfilm-under>), which the film then keeps current.
 *
 * Kept free of imports and closures: the layout inlines its source in <head> as FILM_MODE_SCRIPT, and the client
 * calls it (clientSide true) when the page arrives by client-side navigation, where that script never runs. It decides
 * once per load:
 * a second copy of the script does nothing. On a page without the film it takes back what it set as soon as the
 * document is parsed. A browser whose WebGL 2 API exists but cannot make a context is found out on mount
 * (probeWebGL2, before three.js is fetched) and switches to the still drawing; in the first window nothing moves when
 * it does (the hero keeps its place, only the content below the frame changes).
 */
export function decideFilmMode(clientSide = false): void {
  try {
    const root = document.documentElement;
    if (root.dataset.kfilm !== undefined) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const film = !reduce && "WebGL2RenderingContext" in window;
    root.dataset.kfilm = film ? "film" : "still";
    // At first paint the page is at its top, under which the film's frame lies, unless the browser puts it somewhere
    // else: at an anchor outside the frame, or back at an earlier scroll position (a reload, back or forward). There
    // the film left a note of whether its frame was under the bar (bindNavigationMark), which holds for the restored
    // position; without one the mark waits for the first animation frame, when the position is known. Wherever the
    // frame is not under the bar the navigation keeps its ground. The film keeps the mark current once it runs.
    const entry = (performance.getEntriesByType?.("navigation") ?? [])[0] as
      PerformanceNavigationTiming | undefined;
    // A client-side navigation is not the document's: the router puts the page where it goes.
    const restoring =
      !clientSide &&
      entry !== undefined &&
      entry.type !== "navigate" &&
      history.scrollRestoration !== "manual";
    const hash = location.hash;
    const onFrame =
      restoring ||
      hash === "" ||
      hash === "#top" ||
      hash === "#main" ||
      (film &&
        (hash === "#film-start" ||
          hash === "#evidence" ||
          hash === "#impact" ||
          hash === "#trace"));
    const mark = () => {
      // Not once the film runs (it marks the frame itself), nor on a page found to have no film (below).
      const decided = root.dataset.kfilmReady !== undefined || root.dataset.kfilm === undefined;
      if (onFrame && !decided && window.scrollY < window.innerHeight * 0.5) {
        root.dataset.kfilmUnder = "";
      }
    };
    let note: string | null = null;
    if (restoring) {
      try {
        note = sessionStorage.getItem(`kfilm-under:${location.pathname}`);
      } catch {
        // Storage refused (a private window, blocked site data): wait for the first frame instead.
      }
    }
    if (note === "1") root.dataset.kfilmUnder = "";
    else if (note === null) {
      if (restoring) requestAnimationFrame(mark);
      else mark();
    }
    const filmHere = () => document.querySelector("[data-film-track]") !== null;
    if (document.readyState === "loading") {
      // Placed in <head>, before the page exists: a page without the film keeps no trace of it.
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          if (filmHere() || root.dataset.kfilmReady !== undefined) return;
          delete root.dataset.kfilm;
          delete root.dataset.kfilmUnder;
        },
        { once: true },
      );
    }
    // If the film's script never arrives, show the still layout rather than an empty pinned stage (and leave a page
    // that no longer shows the film alone: a client-side navigation may have happened in the meantime).
    window.setTimeout(() => {
      if (root.dataset.kfilmReady === undefined && root.dataset.kfilm === "film" && filmHere()) {
        root.dataset.kfilm = "still";
      }
    }, 12000);
  } catch {
    // Without matchMedia or dataset the still layout (the default in CSS) stays.
  }
}

/** The inline script for <head>: the function above, called as soon as it is parsed. */
export const FILM_MODE_SCRIPT = `(${decideFilmMode.toString()})();`;

/**
 * Whether a WebGL 2 context can be made here without a major performance caveat (software rendering would not keep
 * up with the film: the still drawing is shown instead). The API can exist without a usable context (a GPU on the
 * blocklist, WebGL turned off): checked once on mount, before three.js and GSAP are fetched, so such a browser never
 * downloads them. The probe context is released at once. Costs a few milliseconds (the first context of a session
 * also starts the GPU process, which the film would pay anyway).
 */
export function probeWebGL2(): boolean {
  try {
    const gl = document
      .createElement("canvas")
      .getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (gl === null) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
