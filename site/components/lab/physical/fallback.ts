import { boardDrawing } from "./board";
import { buildAll } from "./build";
import { endPose, fitView, FOV, frameRect, hullOf, textRightOf } from "./camera";
import type { StageElements, StageHandle, StageOptions } from "./engine";
import { attachKeyboard } from "./keyboard";
import { createLabels } from "./labels";
import { baseName, describeFile, dirName, loadPath, restingOn, type GraphData } from "./model";
import { planPoint } from "./plan";
import type { FromWorker } from "./protocol";

/**
 * Without WebGL: the standing structure drawn on a 2D canvas, from the same simulation (settled once in the worker)
 * and the same camera, fit and labels as the end of the sequence. Hover, tap or the keyboard still name a file and
 * light the load path through it.
 */
export async function startFallback(
  el: StageElements,
  options: StageOptions,
): Promise<StageHandle> {
  const { profile } = options;
  let disposed = false;
  const disposers: (() => void)[] = [];
  const worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
  worker.postMessage({ type: "init", url: options.dataUrl, profile, mode: "still" });
  const data = (await (await fetch(options.dataUrl)).json()) as GraphData;
  const built = buildAll(data, profile);
  const { model, rig } = built;
  const drawing = boardDrawing(built);

  const still = await new Promise<Extract<FromWorker, { type: "still" }>>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      if (event.data.type === "still") resolve(event.data);
      else if (event.data.type === "error") reject(new Error(event.data.message));
    };
  });
  worker.terminate();
  if (disposed) return { dispose() {} };

  const positions = still.positions;
  const forces = still.forces;
  const forceScale = Math.max(1, still.forceScale);
  const ctx = el.canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const files = new Float32Array(rig.files * 3);
  for (let i = 0; i < rig.files; i++) {
    files[i * 3] = positions[i * 4]!;
    files[i * 3 + 1] = positions[i * 4 + 1]!;
    files[i * 3 + 2] = positions[i * 4 + 2]!;
  }

  let width = 1;
  let height = 1;
  const screen = new Float32Array(rig.spec.count * 3);
  const boardScreen = new Float32Array(drawing.lines.count * 6);
  let segOrder = new Uint32Array(0);
  let fileOrder = new Uint32Array(0);
  let depthNear = 0;
  let depthFar = 1;
  let active = -1;
  let selected = -1;
  const hiFile = new Float32Array(rig.files);
  const hiChain = new Float32Array(model.chains.length);

  // The same camera as the end of the sequence, without three.js: the same fit, a look-at and a perspective divide.
  const hull = hullOf(built, drawing.labels, profile);
  const hullScratch = new Float64Array(hull.length);
  let toScreen = (_x: number, _y: number, _z: number): [number, number, number] => [0, 0, 0];
  const layout = () => {
    const pose = endPose(profile);
    const rect = frameRect(
      profile,
      width,
      height,
      textRightOf(el.run, el.root.getBoundingClientRect().left),
      1,
    );
    const fit = fitView(hull, Math.PI, built.pivotY, pose, width / height, rect, hullScratch);
    const d = fit.distance;
    const cp = Math.cos(pose.pitch);
    const eye = [
      d * cp * Math.sin(pose.yaw),
      d * Math.sin(pose.pitch),
      d * cp * Math.cos(pose.yaw),
    ] as const;
    const fwd = normalize([-eye[0], -eye[1], -eye[2]]);
    const right = normalize(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    const f = height / 2 / Math.tan(FOV / 2);
    toScreen = (x, y, z) => {
      // Turned over: rotated by pi about z through the pivot.
      const rx = -x - eye[0];
      const ry = -(y - built.pivotY) - eye[1];
      const rz = z - eye[2];
      const vx = rx * right[0] + ry * right[1] + rz * right[2];
      const vy = rx * up[0] + ry * up[1] + rz * up[2];
      const vz = rx * fwd[0] + ry * fwd[1] + rz * fwd[2];
      return [
        width / 2 + (vx * f) / vz + (fit.shiftX * width) / 2,
        height / 2 - (vy * f) / vz - (fit.shiftY * height) / 2,
        vz,
      ];
    };
    for (let i = 0; i < rig.spec.count; i++) {
      const [x, y, z] = toScreen(positions[i * 4]!, positions[i * 4 + 1]!, positions[i * 4 + 2]!);
      screen[i * 3] = x;
      screen[i * 3 + 1] = y;
      screen[i * 3 + 2] = z;
    }
    for (let i = 0; i < drawing.lines.count; i++) {
      const a = toScreen(
        drawing.lines.p0[i * 3]!,
        drawing.lines.p0[i * 3 + 1]!,
        drawing.lines.p0[i * 3 + 2]!,
      );
      const b = toScreen(
        drawing.lines.p1[i * 3]!,
        drawing.lines.p1[i * 3 + 1]!,
        drawing.lines.p1[i * 3 + 2]!,
      );
      boardScreen.set([a[0], a[1], a[2], b[0], b[1], b[2]], i * 6);
    }
    // Painter's order: far first.
    const segDepth = new Float32Array(rig.segments);
    for (let s = 0; s < rig.segments; s++) {
      segDepth[s] = (screen[rig.spec.segA[s]! * 3 + 2]! + screen[rig.spec.segB[s]! * 3 + 2]!) / 2;
    }
    segOrder = Uint32Array.from({ length: rig.segments }, (_, s) => s).sort(
      (a, b) => segDepth[b]! - segDepth[a]!,
    );
    fileOrder = Uint32Array.from({ length: rig.files }, (_, i) => i).sort(
      (a, b) => screen[b * 3 + 2]! - screen[a * 3 + 2]!,
    );
    depthNear = Infinity;
    depthFar = -Infinity;
    for (let i = 0; i < rig.files; i++) {
      depthNear = Math.min(depthNear, screen[i * 3 + 2]!);
      depthFar = Math.max(depthFar, screen[i * 3 + 2]!);
    }
  };

  const draw = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.canvas.width = Math.round(width * dpr);
    el.canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0e1012";
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = "round";
    const dim = active >= 0;

    // The board's surface, lit from above: the ground the structure stands on.
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const [px, pz] = planPoint(built.plan, (Math.PI * 2 * i) / 64, 1.1);
      const [x, y] = toScreen(px, 0, pz);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.fillStyle = dim ? "rgb(22,25,28)" : "rgb(27,30,34)";
    ctx.fill();

    // The board: plan, footings, scale.
    for (let i = 0; i < drawing.lines.count; i++) {
      const tone = drawing.lines.tone[i]!;
      const alpha = drawing.lines.alpha[i]! * (dim ? 0.55 : 1);
      ctx.strokeStyle =
        tone > 0.5
          ? `rgba(233,230,223,${(alpha * 0.85).toFixed(3)})`
          : `rgba(93,97,102,${alpha.toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(boardScreen[i * 6]!, boardScreen[i * 6 + 1]!);
      ctx.lineTo(boardScreen[i * 6 + 3]!, boardScreen[i * 6 + 4]!);
      ctx.stroke();
    }

    // Members: weight and opacity from the force each carries, fading with depth; the active load path in blue.
    const fog = (depth: number) =>
      Math.min(1, Math.max(0, (depth - depthNear) / Math.max(1e-6, depthFar - depthNear)));
    for (const s of segOrder) {
      const a = rig.spec.segA[s]!;
      const b = rig.spec.segB[s]!;
      const t = Math.sqrt(Math.min(1, Math.max(0, Math.abs(forces[s]!)) / forceScale));
      const hi = hiChain[rig.segChain[s]!]!;
      const depth = fog((screen[a * 3 + 2]! + screen[b * 3 + 2]!) / 2);
      let alpha = (0.13 + 0.72 * t) * (1 - 0.55 * depth);
      let w = 0.55 + 3.2 * t;
      if (hi > 0.75) {
        alpha = 0.95;
        w = Math.max(1.6, w);
      } else if (hi > 0.25) {
        alpha = Math.max(alpha * 0.85, 0.4);
      } else if (dim) {
        alpha *= 0.16;
      }
      ctx.strokeStyle =
        hi > 0.25
          ? `rgba(62,166,255,${alpha.toFixed(3)})`
          : `rgba(233,230,223,${alpha.toFixed(3)})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(screen[a * 3]!, screen[a * 3 + 1]!);
      ctx.lineTo(screen[b * 3]!, screen[b * 3 + 1]!);
      ctx.stroke();
    }

    // Weights: lit from the upper left, as on the stage.
    const f = height / 2 / Math.tan(FOV / 2);
    for (const i of fileOrder) {
      const r = Math.max(1.7, (rig.fileRadius[i]! * f) / screen[i * 3 + 2]!);
      const x = screen[i * 3]!;
      const y = screen[i * 3 + 1]!;
      const hi = hiFile[i]!;
      const depth = fog(screen[i * 3 + 2]!);
      const alpha = hi > 0.75 ? 1 : hi > 0.25 ? 0.62 : dim ? 0.22 : 1;
      const [cr, cg, cb] = hi > 0.25 ? [62, 166, 255] : [233, 230, 223];
      const shade = 1 - 0.5 * depth * (hi > 0.25 ? 0 : 1);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (i === active) {
        ctx.fillStyle = "#0e1012";
        ctx.fill();
        ctx.strokeStyle = "#3ea6ff";
        ctx.lineWidth = Math.max(1.5, r * 0.42);
        ctx.stroke();
        continue;
      }
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(
        0,
        `rgba(${Math.round(cr * shade)},${Math.round(cg * shade)},${Math.round(cb * shade)},${alpha})`,
      );
      g.addColorStop(
        1,
        `rgba(${Math.round(cr * shade * 0.58)},${Math.round(cg * shade * 0.58)},${Math.round(cb * shade * 0.58)},${alpha})`,
      );
      ctx.fillStyle = g;
      ctx.fill();
    }
    labels.place({
      progress: 1,
      angle: Math.PI,
      yaw: endPose(profile).yaw,
      active,
      still: true,
      width,
      height,
      files,
      project: toScreen,
    });
  };

  const labels = createLabels(el.overlay, el.root, built, drawing.labels);

  const resize = () => {
    const rect = el.root.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    layout();
    labels.measure();
    draw();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(el.root);
  disposers.push(() => observer.disconnect());
  resize();
  void document.fonts?.ready.then(() => {
    if (disposed) return;
    labels.measure();
    draw();
  });
  options.onFirstFrame?.({ at: performance.now() });

  const placeCard = (id: number) => {
    const cw = el.card.offsetWidth || 220;
    const ch = el.card.offsetHeight || 90;
    const sx = screen[id * 3]!;
    const sy = screen[id * 3 + 1]!;
    let x = sx + 18;
    let y = sy - ch - 14;
    if (x + cw > width - 12) x = sx - cw - 18;
    if (y < 72) y = sy + 18;
    x = Math.min(Math.max(12, x), width - cw - 12);
    y = Math.min(Math.max(12, y), height - ch - 12);
    el.card.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  };
  const setActive = (id: number) => {
    if (id === active) return;
    active = id;
    hiFile.fill(0);
    hiChain.fill(0);
    if (id >= 0) {
      const down = loadPath(model, id);
      const up = restingOn(model, id);
      for (const f of up) hiFile[f] = 0.5;
      for (const f of down) hiFile[f] = 1;
      hiFile[id] = 2;
      model.chains.forEach((c, ci) => {
        hiChain[ci] = down.has(c.dependent)
          ? 1
          : up.has(c.dependency) && up.has(c.dependent)
            ? 0.5
            : 0;
      });
    }
    draw();
    if (id < 0) {
      el.card.dataset.open = "false";
      return;
    }
    const node = model.nodes[id]!;
    el.cardDir.textContent = dirName(node.path);
    el.cardBase.textContent = baseName(node.path);
    el.cardMeta.replaceChildren(
      ...describeFile(model, id).map((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        return li;
      }),
    );
    el.card.dataset.open = "true";
    placeCard(id);
  };

  // Picking: the nearest weight on screen, within reach of the pointer (a finger reaches further).
  const pick = (cx: number, cy: number, reach: number) => {
    let best = -1;
    let bestD = reach;
    for (let i = 0; i < rig.files; i++) {
      const d = Math.hypot(screen[i * 3]! - cx, screen[i * 3 + 1]! - cy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const rect = el.canvas.getBoundingClientRect();
    const id = pick(event.clientX - rect.left, event.clientY - rect.top, 14);
    setActive(id >= 0 ? id : selected);
  };
  const onDown = (event: PointerEvent) => {
    const rect = el.canvas.getBoundingClientRect();
    const id = pick(
      event.clientX - rect.left,
      event.clientY - rect.top,
      event.pointerType === "mouse" ? 14 : 24,
    );
    selected = id;
    setActive(id);
  };
  const onLeave = (event: PointerEvent) => {
    if (event.pointerType === "mouse") setActive(selected);
  };
  el.canvas.addEventListener("pointermove", onMove);
  el.canvas.addEventListener("pointerdown", onDown);
  el.canvas.addEventListener("pointerleave", onLeave);
  disposers.push(() => {
    el.canvas.removeEventListener("pointermove", onMove);
    el.canvas.removeEventListener("pointerdown", onDown);
    el.canvas.removeEventListener("pointerleave", onLeave);
  });
  disposers.push(
    attachKeyboard(
      el.root,
      el.live,
      model,
      labels,
      () => selected,
      (id) => {
        selected = id;
        setActive(id);
      },
    ),
  );

  return {
    dispose() {
      disposed = true;
      for (const d of disposers.reverse()) d();
      el.overlay.replaceChildren();
    },
  };
}

function normalize(v: readonly number[]): [number, number, number] {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / l, v[1]! / l, v[2]! / l];
}

function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
}
