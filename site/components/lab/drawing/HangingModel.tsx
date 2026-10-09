"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { GraphDocument } from "./model";
import css from "./hanging.module.css";

/** Where Katedrala's analysis of CodeVerse is served from (public/data, written by scripts/build-codeverse-graph.mjs). */
const DATA_URL = "/data/codeverse-graph.json";

/** One request per page, however often the stage mounts (a remount, or the development double effect). */
let dataRequest: Promise<GraphDocument> | null = null;

function loadData(): Promise<GraphDocument> {
  dataRequest ??= fetch(DATA_URL).then((r) => {
    if (!r.ok) throw new Error(`${DATA_URL}: ${r.status}`);
    return r.json() as Promise<GraphDocument>;
  });
  dataRequest.catch(() => (dataRequest = null));
  return dataRequest;
}

function hasWebGL2(): boolean {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    const ok = gl !== null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

interface Props {
  /** The hero copy (server-rendered), over the first viewport of the stage. */
  readonly copy: ReactNode;
  /** The scroll captions (server-rendered), placed down the pinned scroll; still notes for the still layout. */
  readonly captions: ReactNode;
  /**
   * The drawing's title block (server-rendered); live cells carry data-hm="view", data-hm="angle" and
   * data-hm="status".
   */
  readonly titleBlock: ReactNode;
  /** The text alternative of the drawing (server-rendered); must carry id "hm-description". */
  readonly description: ReactNode;
  /** The board line and anchors drawn on the server, shown until the drawing takes over. */
  readonly board: ReactNode;
}

/**
 * The pinned stage of the hanging model. Text, title block and the text alternative render on the server; this
 * component owns the canvas and loads the drawing engine (and three.js, only where WebGL 2 works) after the
 * page has painted.
 */
export function HangingModel({ copy, captions, titleBlock, description, board }: Props) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const figure = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<SVGSVGElement>(null);
  const hang = useRef<HTMLDivElement>(null);
  const plan = useRef<HTMLDivElement>(null);
  const stand = useRef<HTMLDivElement>(null);
  const live = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const root = section.current;
    const elements = [stage, figure, canvas, overlay, hang, plan, stand, live].map(
      (r) => r.current,
    );
    if (root === null || elements.some((e) => e === null)) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const webgl = hasWebGL2();
    // Without WebGL the drawing is a still of the standing structure: switch to the still layout at once,
    // while the reader is still on the first viewport (it only changes what lies below the fold).
    if (!webgl) root.dataset.layout = "still";
    const data = loadData();
    const engine = import("./engine/stage");
    const renderer = webgl
      ? import("./engine/gl").then((m) => m.createGLDrawing)
      : import("./engine/canvas2d").then((m) => m.createCanvasDrawing);

    Promise.all([data, engine, renderer])
      .then(([doc, { mountStage }, create]) => {
        if (cancelled) return;
        dispose = mountStage(
          {
            section: root,
            stage: stage.current!,
            figure: figure.current!,
            canvas: canvas.current!,
            overlay: overlay.current!,
            frames: { hang: hang.current!, plan: plan.current!, stand: stand.current! },
            view: root.querySelector<HTMLElement>('[data-hm="view"]'),
            angle: root.querySelector<HTMLElement>('[data-hm="angle"]'),
            status: root.querySelector<HTMLElement>('[data-hm="status"]'),
            titleBlock: root.querySelector<HTMLElement>('[data-hm="title-block"]'),
            live: live.current!,
          },
          { data: doc, renderer: create, still: still || !webgl },
        );
        root.dataset.drawing = webgl ? (still ? "still" : "live") : "fallback";
      })
      .catch((error: unknown) => {
        // The server-drawn board, the title block and the text alternative remain; the captions switch to the
        // still notes, since nothing will hang or turn.
        root.dataset.drawing = "failed";
        root.dataset.layout = "still";
        console.error("Hanging model:", error);
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return (
    <section
      ref={section}
      className={css.section}
      aria-labelledby="hm-title"
      data-drawing="pending"
    >
      {/* The copy is positioned out of flow, so it can lead the reading and tab order without moving the pin. */}
      <div className={css.copy}>{copy}</div>
      <div ref={stage} className={css.stage}>
        <figure
          ref={figure}
          className={css.figure}
          tabIndex={0}
          aria-label="Katedrala's analysis of CodeVerse, drawn as a hanging chain model and turned over"
          aria-describedby="hm-description hm-keys"
        >
          <div className={css.board} aria-hidden="true">
            {board}
          </div>
          <canvas ref={canvas} className={css.canvas} aria-hidden="true" />
          <svg ref={overlay} className={css.overlay} aria-hidden="true" />
          <div ref={hang} className={css.frameHang} aria-hidden="true" />
          <div ref={plan} className={css.framePlan} aria-hidden="true" />
          <div ref={stand} className={css.frameStand} aria-hidden="true" />
          {description}
        </figure>
        {titleBlock}
        <p ref={live} className="sr-only" aria-live="polite" />
      </div>
      <div className={css.captions}>{captions}</div>
    </section>
  );
}
