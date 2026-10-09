/**
 * The landing, "Trace any file.": the camera settles on the still drawing's three-quarter view of the standing
 * structure, and any of the 404 files can be traced, in both directions: from the drawing (hover previews, a click or
 * a tap pins) or from the controls in the act's block (a radio group for the direction, a select of every file by
 * folder, four files to start from). The readout states the trace in one sentence. While a file is traced, hovering a
 * file it reaches shows the shortest path between the two. Escape clears the trace.
 *
 * The traces are this page's, computed over Katedrala's dependencies (trace.ts); the block says so under the readout.
 */
import type { ActContext, ActDefinition, ActOverlay, CameraKey, LitMask, TraceView } from "../act";
import type { HangingModel } from "../model";
import { cameraFrom, emptyCamera, type CameraState, type Framing } from "../timeline";
import { pathToNote, READOUT_NONE, restsOnSentence, standsOnSentence, traceNote } from "./copy";
import { graphOf, key, modelGraph, nearestYaw, valuesOf } from "./shared";
import { ACT_TIMINGS, LANDING } from "./timing";
import { pathMask, reachOf, trace, traceMask, type Reach, type TraceDirection } from "./trace";

/** What the landing traces: the file chosen (from the controls or the drawing) and the direction. */
const state: { subject: number; direction: TraceDirection } = { subject: -1, direction: "down" };

/** The local time the landing's anchor and focus bring the film to: settled, controls in view. */
const SETTLED = ACT_TIMINGS.find((a) => a.id === "trace")?.anchor ?? 0.4;

/* ------------------------------------------------------------------------------------------------------------
 * The camera: the still drawing's view (timeline.ts stillCamera) on wide windows, so the landing and the still
 * layout share one composition; on tall ones the same view lifted above the controls' sheet.
 * ---------------------------------------------------------------------------------------------------------- */

function landingShot(model: HangingModel, framing: Framing, yawNear: number): number[] {
  const H = model.maxLevel * model.levelHeight;
  return framing === "wide"
    ? [nearestYaw(Math.PI + 0.42, yawNear), 0.14, 47, 0, H / 2 - 0.6, 0, 31, 0.3, 0.065]
    : [nearestYaw(Math.PI * 1.5 + 0.42, yawNear), 0.16, 84, 0, H / 2 - 0.6, 0, 38, 0, 0.45];
}

function cameraKeys(model: HangingModel, framing: Framing, from: CameraKey | null): CameraKey[] {
  const start = from ?? key(0, landingShot(model, framing, 0));
  const shot = landingShot(model, framing, start[1]);
  return [key(0, valuesOf(start)), key(LANDING.settle.to, shot), key(1, shot)];
}

/** The still layout's figure: the same view, centred in its own frame beside the controls. */
function stillCamera(model: HangingModel, framing: Framing): CameraState {
  const H = model.maxLevel * model.levelHeight;
  const values =
    framing === "wide"
      ? [Math.PI + 0.42, 0.14, 47, 0, H / 2 - 0.6, 0, 31, 0, 0.04]
      : [Math.PI * 1.5 + 0.42, 0.14, 64, 0, H / 2 - 0.6, 0, 38, 0, 0.02];
  return cameraFrom(values, emptyCamera());
}

/* ------------------------------------------------------------------------------------------------------------
 * Tracing.
 * ---------------------------------------------------------------------------------------------------------- */

/** A file's runtime reach in one direction, over the drawing's chains (counts as the readout's runtime ones). */
function runtimeReach(model: HangingModel, v: number, direction: TraceDirection): Reach {
  const tr = trace(modelGraph(model), v, direction, "runtime");
  return {
    direct: tr.layers[1]?.length ?? 0,
    runtime: tr.count,
    foundations: tr.foundationCount,
    types: tr.count,
    tests: tr.count,
  };
}

function traceOf(v: number, model: HangingModel): TraceView {
  const g = modelGraph(model);
  const { subject, direction } = state;
  if (subject >= 0 && subject !== v && subject < model.n) {
    const tr = trace(g, subject, direction, "runtime");
    const steps = tr.step[v] ?? -1;
    if (steps > 0) {
      const m = pathMask(tr, v);
      return {
        mask: { nodes: m.nodes, edges: m.edges, dim: 0.72 },
        note: pathToNote(model.paths[subject]!, steps, direction),
      };
    }
  }
  const tr = trace(g, v, direction, "runtime");
  const m = traceMask(tr);
  return {
    mask: { nodes: m.nodes, edges: m.edges, dim: 0.8 } satisfies LitMask,
    note: traceNote(
      model.level[v]!,
      model.lines[v]!,
      direction,
      runtimeReach(model, v, direction),
      model.foundation[v] === 1,
    ),
  };
}

/* ------------------------------------------------------------------------------------------------------------
 * The controls (the block's markup, LandingAct.tsx): bound once, kept in step with the drawing.
 * ---------------------------------------------------------------------------------------------------------- */

class LandingOverlay implements ActOverlay {
  private readonly ctx: ActContext;
  private readonly slot: HTMLElement | null;
  private readonly radios: HTMLInputElement[];
  private readonly select: HTMLSelectElement | null;
  private readonly picks: HTMLButtonElement[];
  private readonly readout: HTMLElement | null;
  private readonly panel: HTMLElement | null;
  private readonly scopeLine: HTMLElement | null;
  private readonly legendToggle: HTMLButtonElement | null;
  private readonly legend: HTMLElement | null;
  private readonly cleanups: (() => void)[] = [];
  private shown = false;

  constructor(ctx: ActContext) {
    this.ctx = ctx;
    const slot = ctx.slot;
    this.slot = slot;
    this.radios =
      slot === null ? [] : [...slot.querySelectorAll<HTMLInputElement>("[data-ld-show] input")];
    this.select = slot?.querySelector<HTMLSelectElement>("[data-ld-file]") ?? null;
    this.picks =
      slot === null ? [] : [...slot.querySelectorAll<HTMLButtonElement>("[data-ld-pick]")];
    this.readout = slot?.querySelector<HTMLElement>("[data-ld-readout]") ?? null;
    this.panel = slot?.querySelector<HTMLElement>("[data-ld-panel]") ?? null;
    this.scopeLine = slot?.querySelector<HTMLElement>("[data-ld-scope]") ?? null;
    this.legendToggle = slot?.querySelector<HTMLButtonElement>("[data-ld-legend-toggle]") ?? null;
    this.legend = slot?.querySelector<HTMLElement>("[data-ld-legend]") ?? null;
    if (slot === null) return;

    // Whatever was traced before the landing (a file pinned on the drawing in an earlier act) carries over.
    state.subject = ctx.pinnedFile();
    const checked = this.radios.find((r) => r.checked);
    state.direction = checked?.value === "up" ? "up" : "down";
    slot.setAttribute("data-ld-ready", "");

    const on = <K extends keyof HTMLElementEventMap>(
      el: EventTarget | null,
      type: K,
      listener: (event: HTMLElementEventMap[K]) => void,
    ) => {
      if (el === null) return;
      el.addEventListener(type, listener as EventListener);
      this.cleanups.push(() => el.removeEventListener(type, listener as EventListener));
    };
    for (const radio of this.radios) {
      on(radio, "change", () => {
        if (!radio.checked) return;
        state.direction = radio.value === "up" ? "up" : "down";
        this.ctx.retrace();
        this.sync(true);
      });
    }
    on(this.select, "change", () => {
      const value = this.select?.value ?? "";
      this.choose(value === "" ? -1 : Number(value));
    });
    for (const pick of this.picks) {
      on(pick, "click", () => {
        const v = Number(pick.dataset.file);
        this.choose(v === state.subject ? -1 : v);
      });
    }
    on(this.legendToggle, "click", () => {
      const open = this.legendToggle?.getAttribute("aria-expanded") !== "true";
      this.legendToggle?.setAttribute("aria-expanded", String(open));
      this.legend?.toggleAttribute("data-open", open);
    });
    // Focus reveal: a control reached from the keyboard brings the film to the landing, controls in view.
    on(slot, "focusin", (event) => {
      if (ctx.mode !== "film") return;
      const target = event.target as Element | null;
      if (target?.matches(":focus-visible") === true && slot.getAttribute("data-active") === null) {
        ctx.reveal(SETTLED);
      }
    });
    this.cleanups.push(
      ctx.onPin((v) => {
        state.subject = v;
        this.ctx.retrace();
        // A pin made on the drawing is announced by the film; the readout follows quietly.
        this.sync(false);
      }),
    );
    this.sync(false);
  }

  /** A file chosen from the controls: traced at once, announced by the readout. */
  private choose(v: number): void {
    state.subject = v;
    this.ctx.pin(v);
    this.ctx.retrace();
    this.sync(true);
  }

  /** The controls and the readout as the trace now stands. */
  private sync(announce: boolean): void {
    const { ctx } = this;
    const v = state.subject;
    if (this.select !== null) this.select.value = v >= 0 ? String(v) : "";
    for (const pick of this.picks) {
      pick.setAttribute("aria-pressed", String(Number(pick.dataset.file) === v));
    }
    const readout = this.readout;
    if (readout === null) return;
    let text = READOUT_NONE;
    if (v >= 0 && v < ctx.model.n) {
      const path = ctx.model.paths[v]!;
      const reach = reachOf(graphOf(ctx.data), v, state.direction);
      text =
        state.direction === "up"
          ? restsOnSentence(path, reach)
          : standsOnSentence(path, reach, ctx.model.foundation[v] === 1);
    }
    if (readout.textContent === text) return;
    // A pin from the drawing is announced by the film: the readout changes without speaking twice.
    if (!announce) readout.setAttribute("aria-live", "off");
    readout.textContent = text;
    if (!announce) requestAnimationFrame(() => readout.removeAttribute("aria-live"));
    this.keepInView();
  }

  /**
   * On a short frame the controls' column scrolls (a phone turned, a small phone's sheet): a longer readout keeps
   * itself and its scope line in view by scrolling the column, never the page (the page's scroll is the film's).
   */
  private keepInView(): void {
    const panel = this.panel;
    const last = this.scopeLine ?? this.readout;
    if (panel === null || last === null || panel.scrollHeight <= panel.clientHeight + 1) return;
    const bottom =
      panel.getBoundingClientRect().bottom -
      (parseFloat(getComputedStyle(panel).paddingBottom) || 0);
    const over = last.getBoundingClientRect().bottom - bottom;
    if (over > 0.5) panel.scrollTop += Math.ceil(over);
  }

  /**
   * The controls hold their state; the director shows the block while the landing is on screen. While it is, the
   * column (or the sheet) is a word on the frame that the drawing's labels keep clear of ([data-obstacle][data-on]).
   */
  update(t: number): void {
    const on = t >= 0;
    if (on === this.shown) return;
    this.shown = on;
    this.panel?.toggleAttribute("data-on", on);
  }

  dispose(): void {
    for (const c of this.cleanups) c();
    this.cleanups.length = 0;
    this.slot?.removeAttribute("data-ld-ready");
    this.panel?.removeAttribute("data-on");
  }
}

/* ------------------------------------------------------------------------------------------------------------
 * The act.
 * ---------------------------------------------------------------------------------------------------------- */

export const landingAct: ActDefinition = {
  id: "trace",
  cameraKeys,
  // Nothing is lit until a file is traced: the structure stands plain for the visitor to choose from.
  lit: () => null,
  traceOf,
  mount: (ctx) => new LandingOverlay(ctx),
  still: {
    camera: stillCamera,
    lit: () => null,
    t: 1,
  },
};
