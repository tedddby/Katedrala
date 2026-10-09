import sys

p = sys.argv[1]
s = open(p, encoding="utf-8").read()


def rep(old, new, count=1):
    global s
    assert old in s, old[:100]
    s = s.replace(old, new, count)


rep(
    "  /* Not isolated: on phones the title block (z 5) must sit over the closing card (z 4), outside this frame. */",
    "  /* Not isolated: on phones the title block (z 5) must sit over the landing's sheet (z 4), outside this frame. */",
)
rep(
    """  /* At the foot of the frame, under the drawing it names (above the headline it would read as a label). Three
   * lines; the captions and the card keep clear of them. */""",
    """  /* At the foot of the frame, under the drawing it names (above the headline it would read as a label). Three
   * lines; the captions and the landing keep clear of them. */""",
)
rep(
    """ * Short wide windows (a phone turned to landscape, a small laptop window): the hero, the narration and the card
 * are scaled to the height, so nothing runs under the bar or off the foot of the frame.""",
    """ * Short wide windows (a phone turned to landscape, a small laptop window): the hero and the narration are scaled
 * to the height, so nothing runs under the bar or off the foot of the frame.""",
)
rep(
    """  .actions {
    margin-top: 1rem;
  }

  .actions > a {
    height: 2.5rem;
  }
""",
    """  .actions {
    margin-top: 1rem;
  }
""",
)
rep(
    """@media (prefers-reduced-motion: reduce) {
  .hword,""",
    """/* A fine pointer gets the compact button there; a phone keeps the 44px target. */
@media (max-height: 560px) and (min-aspect-ratio: 19/20) and (pointer: fine) {
  .actions > a {
    height: 2.5rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hword,""",
)
rep(
    """.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
""",
    """.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* ---------------------------------------------------------------------------------------------------------
 * One text, two presentations. Each act's block (its h2, narration, record and controls) sits in a slot after the
 * frame, in reading order. In the film the slots are placed at their acts' anchors on the track, so a block that is
 * read (or found) lands the film on its act; the visible words are the captions. In the still layout the slots are
 * the article, in normal flow. The anchors (#film-start, #evidence, #impact, #trace) are empty marks at the same
 * places: in the film the window stops exactly on the beat (they cancel the page's scroll padding: the frame is
 * pinned under a clear bar), in the still layout just above the block.
 * ------------------------------------------------------------------------------------------------------- */

.anchor {
  display: block;
  height: 0;
}

:global(html[data-kfilm="film"]) .anchor {
  position: absolute;
  left: 0;
  top: calc(var(--k-at-wide) * 100vh);
  scroll-margin-top: -5rem;
}

:global(html[data-kfilm="film"]) .slot {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(var(--k-at-wide) * 100vh);
}

/*
 * The landing's block holds controls the visitor uses with the drawing: in the film it is pinned over the frame for
 * the whole act (from the act's start to the end of the track, where it leaves with the frame). Empty where it does
 * not draw, so the pointer still reaches the drawing.
 */
:global(html[data-kfilm="film"]) .slotPinned {
  position: sticky;
  z-index: 4;
  top: 0;
  height: 100vh;
  height: 100svh;
  margin-top: calc(var(--k-from-wide) * 100vh - 100vh);
  margin-top: calc(var(--k-from-wide) * 100vh - 100svh);
  pointer-events: none;
}

@media (max-aspect-ratio: 949/1000) {
  :global(html[data-kfilm="film"]) .anchor,
  :global(html[data-kfilm="film"]) .slot {
    top: calc(var(--k-at-tall) * 100vh);
  }

  :global(html[data-kfilm="film"]) .slotPinned {
    margin-top: calc(var(--k-from-tall) * 100vh - 100vh);
    margin-top: calc(var(--k-from-tall) * 100vh - 100svh);
  }
}

/* The acts' words over the drawing: only in the film (the still layout's figures carry their own). */
.layer {
  display: none;
}

:global(html[data-kfilm="film"]) .layer {
  display: block;
  position: absolute;
  z-index: 4;
  inset: 0;
  pointer-events: none;
}

/*
 * Act I's narration. In the film it is read, not seen (the captions show its words). In the still layout it is the
 * article under the hero frame: every beat as a heading-sized sentence and its line, on the page frame.
 */
.narration {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
  gap: 2.5rem clamp(1.5rem, 3vw, 3rem);
  padding: 3rem var(--k-edge) 0;
}

:global(html[data-kfilm="film"]) .narration {
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.beat {
  margin: 0;
}

.beatTitle {
  margin: 0;
  font-family: var(--k-display);
  font-size: clamp(1.625rem, 1.05rem + 1.5vw, 2.625rem);
  font-weight: 620;
  font-variation-settings: "wdth" 80;
  line-height: 1.02;
  letter-spacing: -0.024em;
  text-wrap: balance;
}

.beatBody {
  margin: 0.875rem 0 0;
  max-width: 36ch;
  font-size: 1.0625rem;
  line-height: 1.5;
  color: var(--k-soft);
  text-wrap: pretty;
}

.beatTitle code,
.beatBody code {
  font-family: var(--k-mono);
  font-variation-settings: "wdth" 87.5;
  letter-spacing: -0.03em;
}

.beatTitle code {
  font-size: 0.72em;
  font-weight: 500;
}

.beatBody code {
  font-size: 0.86em;
  color: var(--k-ink);
}

/*
 * An act's still figure (StillFigure.tsx): its drawing in the still layout, framed like the hero's (wide on wide
 * windows, tall on phones), with its labels and leaders. Absent from the film and without script.
 */
.still {
  display: none;
}

:global(html[data-kfilm="still"]) .still {
  display: block;
  position: relative;
  overflow: hidden;
  margin: 2.5rem 0 0;
  aspect-ratio: 16 / 10;
  max-height: 64rem;
  background: var(--k-sheet);
}

@media (max-aspect-ratio: 949/1000) {
  :global(html[data-kfilm="still"]) .still {
    aspect-ratio: 4 / 5;
  }
}

.stillLayer {
  position: absolute;
  z-index: 4;
  inset: 0;
  pointer-events: none;
}
""",
)
rep(
    """  .captionBody {
    margin-top: 0.625rem;
    font-size: 0.9375rem;
  }

  :global(html[data-kfilm="film"]) .gauge {""",
    """  .captionBody {
    margin-top: 0.625rem;
    font-size: 0.9375rem;
  }

  .beatTitle {
    font-size: clamp(1.5rem, 1.1rem + 2vw, 1.875rem);
  }

  .beatBody {
    margin-top: 0.625rem;
    font-size: 0.9375rem;
  }

  :global(html[data-kfilm="film"]) .gauge {""",
)
open(p, "w", encoding="utf-8", newline="\n").write(s)
print("ok")
