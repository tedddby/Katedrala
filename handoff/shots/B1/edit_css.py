import sys

p = sys.argv[1]
s = open(p, encoding="utf-8").read()


def rep(old, new, count=1):
    global s
    assert old in s, old[:100]
    s = s.replace(old, new, count)


rep(
    """/*
 * The cinematic hero: a pinned, scroll-scrubbed film on the drawing sheet. Two layouts, chosen before first
 * paint by an inline script on <html data-kfilm>: "film" (the sticky stage over a tall track) and "still"
 * (reduced motion, no WebGL, or no script: the standing structure with its notes in normal flow).
 *
 * Two compositions, split on the window's aspect exactly where the camera splits its framings (timeline.ts,
 * width / height 0.95): wide (words left, structure right) and tall (words above and below the structure: phones,
 * tablets in portrait). Short wide windows (a phone in landscape) scale the words to the height.
 */
.film,
.nav,
.reading {
  --k-sheet""",
    """/*
 * The film: one pinned, scroll-scrubbed track on the drawing sheet. Two layouts, chosen before first paint by the
 * mode script on <html data-kfilm>: "film" (the sticky stage over a tall track, its length set by the server from
 * the acts' lengths) and "still" (reduced motion, no usable WebGL 2, or no script: the hero frame with its still
 * drawing, then the acts' blocks in normal flow, an illustrated article).
 *
 * Two compositions, split on the window's aspect exactly where the camera splits its framings (timeline.ts,
 * width / height 0.95): wide (words left, structure right) and tall (words above and below the structure: phones,
 * tablets in portrait). Short wide windows (a phone in landscape) scale the words to the height. The words align to
 * the page frame (82.5rem plus gutters), so the wordmark, the headline and every section share one left edge.
 */
.film {
  --k-sheet""",
)
rep(
    """  --k-gutter: clamp(1rem, 4vw, 3rem);""",
    """  --k-gutter: var(--page-gutter, clamp(1rem, 4vw, 3rem));
  /* The page frame's edge, from the frame's own edge: resolved where it is used (100% is that element's width). */
  --k-edge: max(var(--k-gutter), calc((100% - var(--page-max, 82.5rem)) / 2));""",
)
rep(
    """:global(html[data-kfilm="film"]) .track {
  height: 760vh;
}""",
    """:global(html[data-kfilm="film"]) .track {
  height: calc(var(--k-track-wide) * 100vh);
}""",
)
rep(
    """@media (max-aspect-ratio: 949/1000) {
  :global(html[data-kfilm="film"]) .track {
    height: 680vh;
  }
}""",
    """@media (max-aspect-ratio: 949/1000) {
  :global(html[data-kfilm="film"]) .track {
    height: calc(var(--k-track-tall) * 100vh);
  }
}""",
)
rep(
    """.canvas[data-ready] {
  opacity: 1;
}""",
    """.canvas[data-ready] {
  opacity: 1;
}

/* Without script nothing draws: no empty canvas. */
:global(html:not([data-js])) .canvas {
  display: none;
}""",
)
rep(
    """.hero {
  position: absolute;
  z-index: 4;
  left: var(--k-gutter);""",
    """.hero {
  position: absolute;
  z-index: 4;
  left: var(--k-edge);""",
)
start = s.index(""".button {
  display: inline-flex;""")
end = s.index("""/* ---------------------------------------------------------------------------------------------------------
 * The drawing's title block: what this is, always on screen.""")
s = (
    s[:start]
    + """/* The actions are the site's buttons (ui/Button); the film only fits them to its frames. */
.actions > a {
  flex: none;
}

"""
    + s[end:]
)
rep(
    """  right: calc(var(--k-gutter) - 0.4rem);
  bottom: calc(1.25rem - 0.3rem);""",
    """  right: calc(var(--k-edge) - 0.4rem);
  bottom: calc(1.25rem - 0.3rem);""",
)
rep(
    """/* ---------------------------------------------------------------------------------------------------------
 * Captions: the narration. In the film they sit over the frame and drop in word by word.
 * ------------------------------------------------------------------------------------------------------- */

.captions {
  margin: 0;
  padding: 3rem var(--k-gutter) 0;
  list-style: none;
  display: grid;
  gap: 2.5rem;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
}
""",
    """/* ---------------------------------------------------------------------------------------------------------
 * Captions: the narration's visible form in the film. They sit over the frame and drop in word by word; hidden from
 * assistive technology (the narration block carries the words) and absent from the still layout (the block is the
 * article there).
 * ------------------------------------------------------------------------------------------------------- */

.captions {
  display: none;
  margin: 0;
  padding: 0;
  list-style: none;
}
""",
)
rep(
    """:global(html[data-kfilm="film"]) .captions {
  position: absolute;
  z-index: 4;
  left: var(--k-gutter);""",
    """:global(html[data-kfilm="film"]) .captions {
  position: absolute;
  z-index: 4;
  left: var(--k-edge);""",
)
rep(
    """:global(html[data-kfilm="film"]) .gauge {
  position: absolute;
  z-index: 4;
  right: calc(var(--k-gutter) - 0.75rem);""",
    """:global(html[data-kfilm="film"]) .gauge {
  position: absolute;
  z-index: 4;
  right: calc(var(--k-edge) - 0.75rem);""",
)
start = s.index("""/* ---------------------------------------------------------------------------------------------------------
 * The landing: one real file and what it stands on.""")
end = s.index("""/* Where "Skip the film" lands""")
s = s[:start] + s[end:]
rep(
    """/* Where "Skip the film" lands: the end of the section, at the top of the window (the page's scroll padding for
 * the bar would leave a strip of the frame showing under it). It takes focus there, and draws nothing. */
.end {""",
    """/* The end of the film: at the top of the window when jumped to (the page's scroll padding for the bar would leave
 * a strip of the frame showing under it). It can take focus there, and draws nothing. */
.end {""",
)
rep(
    """@media (max-aspect-ratio: 949/1000) {
  .hero {
    left: var(--k-gutter);
    right: var(--k-gutter);
    top: 5.5rem;
    width: auto;
  }""",
    """@media (max-aspect-ratio: 949/1000) {
  .hero {
    left: var(--k-edge);
    right: var(--k-edge);
    top: 5.5rem;
    width: auto;
  }""",
)
rep(
    """  .actions {
    margin-top: 1.25rem;
    gap: 0.5rem;
  }

  .button {
    padding: 0 1rem;
  }
""",
    """  .actions {
    margin-top: 1.25rem;
    gap: 0.5rem;
  }

  .actions > a {
    padding-inline: 1rem;
  }
""",
)
rep(
    """  .titleblock {
    z-index: 5;
    left: calc(var(--k-gutter) - 0.4rem);""",
    """  .titleblock {
    z-index: 5;
    left: calc(var(--k-edge) - 0.4rem);""",
)
rep(
    """  :global(html[data-kfilm="film"]) .captions {
    left: var(--k-gutter);
    right: var(--k-gutter);
    bottom: calc(5.25rem + env(safe-area-inset-bottom, 0px));""",
    """  :global(html[data-kfilm="film"]) .captions {
    left: var(--k-edge);
    right: var(--k-edge);
    bottom: calc(5.25rem + env(safe-area-inset-bottom, 0px));""",
)
rep(
    """  :global(html[data-kfilm="film"]) .gauge {
    right: calc(var(--k-gutter) - 0.5rem);""",
    """  :global(html[data-kfilm="film"]) .gauge {
    right: calc(var(--k-edge) - 0.5rem);""",
)
start = s.index("""  :global(html[data-kfilm="film"]) .card {
    left: 0;""")
end = s.index("""/* ---------------------------------------------------------------------------------------------------------
 * Short wide windows""")
s = s[:start].rstrip() + "\n}\n\n" + s[end:]
rep(
    """  .actions {
    margin-top: 1rem;
  }

  .button {
    height: 2.5rem;
  }
""",
    """  .actions {
    margin-top: 1rem;
  }

  .actions > a {
    height: 2.5rem;
  }
""",
)
start = s.index("""  :global(html[data-kfilm="film"]) .card {
    top: calc(50% + 1.75rem);""")
end = s.index("""@media (prefers-reduced-motion: reduce) {""")
s = s[:start].rstrip() + "\n}\n\n" + s[end:]
start = s.index("""/* ---------------------------------------------------------------------------------------------------------
 * The route's top bar and the notes that follow the film.""")
s = s[:start].rstrip() + "\n"
open(p, "w", encoding="utf-8", newline="\n").write(s)
print("ok")
