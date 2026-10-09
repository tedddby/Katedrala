"use client";

import { useEffect, useRef } from "react";
import type { Profile } from "./config";
import type { StageElements, StageHandle } from "./engine";

interface Props {
  /** Id of the tall section whose scroll drives the sequence. */
  readonly runId: string;
  /** Id of the text that states what the structure shows. */
  readonly describedBy: string;
  readonly label: string;
  /** The drawing's title block: what it is, where the numbers come from. */
  readonly titleLines: readonly string[];
}

const DATA_URL = "/data/codeverse-graph.json";

/**
 * The stage box. It reserves its space from the first paint (no layout shift), then loads the simulation and the
 * renderer after hydration so three.js never blocks the page. Without WebGL it draws the standing structure once on
 * a 2D canvas; with reduced motion it shows the standing structure still.
 */
export function PhysicalStage({ runId, describedBy, label, titleLines }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardDirRef = useRef<HTMLSpanElement>(null);
  const cardBaseRef = useRef<HTMLSpanElement>(null);
  const cardMetaRef = useRef<HTMLUListElement>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const run = document.getElementById(runId);
    if (!root || !canvas || !run || !overlayRef.current || !cardRef.current) return;
    const elements: StageElements = {
      root,
      canvas,
      overlay: overlayRef.current,
      card: cardRef.current,
      cardDir: cardDirRef.current!,
      cardBase: cardBaseRef.current!,
      cardMeta: cardMetaRef.current!,
      live: liveRef.current!,
      run,
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const profile: Profile = window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop";
    let handle: StageHandle | null = null;
    let cancelled = false;
    const mark = (state: string) => {
      root.dataset.state = state;
    };
    mark("loading");

    const options = {
      dataUrl: DATA_URL,
      profile,
      reduced,
      onFirstFrame: () => mark("ready"),
      onError: (message: string) => {
        mark("error");
        console.warn(`[stage] ${message}`);
      },
    };

    const start = async () => {
      if (hasWebGL2()) {
        const { startStage } = await import("./engine");
        if (cancelled) return;
        handle = await startStage(elements, options);
      } else {
        root.dataset.webgl = "none";
        const { startFallback } = await import("./fallback");
        if (cancelled) return;
        handle = await startFallback(elements, options);
      }
      if (cancelled) handle.dispose();
    };
    start().catch((error: unknown) => {
      mark("error");
      console.warn("[stage]", error);
    });

    return () => {
      cancelled = true;
      handle?.dispose();
    };
  }, [runId]);

  return (
    <div
      ref={rootRef}
      className="phx-stage"
      role="group"
      tabIndex={0}
      aria-label={label}
      aria-describedby={describedBy}
      aria-roledescription="interactive model"
      data-state="idle"
    >
      <canvas ref={canvasRef} className="phx-canvas" aria-hidden="true" />
      <div ref={overlayRef} className="phx-overlay" aria-hidden="true" />
      <div ref={cardRef} className="phx-card" data-open="false" aria-hidden="true">
        <p className="phx-card-path">
          <span ref={cardDirRef} className="phx-card-dir" />
          <span ref={cardBaseRef} className="phx-card-base" />
        </p>
        <ul ref={cardMetaRef} className="phx-card-meta" />
      </div>
      <p className="phx-title-block">
        {titleLines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
      <p ref={liveRef} className="phx-sr" aria-live="polite" />
    </div>
  );
}

function hasWebGL2(): boolean {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
