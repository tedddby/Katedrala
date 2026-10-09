import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DoubleSide,
  FloatType,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  Mesh,
  NearestFilter,
  PerspectiveCamera,
  RedFormat,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
  type IUniform,
} from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { boardDrawing } from "./board";
import { planPoint } from "./plan";
import { buildAll, type Built } from "./build";
import {
  standingOf,
  END_PROGRESS,
  FOV,
  fitView,
  flipTarget,
  frameRect,
  hullOf,
  poseAt,
  textRightOf,
  type CameraPose,
} from "./camera";
import type { Profile } from "./config";
import { baseName, describeFile, dirName, loadPath, restingOn, type GraphData } from "./model";
import { attachKeyboard } from "./keyboard";
import { createLabels } from "./labels";
import {
  texRows,
  TEX_WIDTH,
  type AirInput,
  type DragInput,
  type FromWorker,
  type ToWorker,
} from "./protocol";
import {
  BOARD_VERTEX,
  CHAIN_VERTEX,
  LINE_FRAGMENT,
  PLANE_FRAGMENT,
  PLANE_VERTEX,
  WEIGHT_FRAGMENT,
  WEIGHT_VERTEX,
} from "./shaders";

/**
 * The stage: draws the simulated model with three.js and turns the reader's scroll, pointer and keys into what the
 * simulation and the camera should do. The page's text never depends on it.
 */

export interface StageElements {
  /** The sticky stage box (sizes the canvas). */
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  /** Layer for labels drawn over the canvas. */
  readonly overlay: HTMLElement;
  /** The identity card of the file under the pointer (or selected with the keyboard). */
  readonly card: HTMLElement;
  readonly cardDir: HTMLElement;
  readonly cardBase: HTMLElement;
  readonly cardMeta: HTMLElement;
  /** Announces keyboard selections. */
  readonly live: HTMLElement;
  /** The tall section whose scroll drives the sequence. */
  readonly run: HTMLElement;
}

export interface StageOptions {
  readonly dataUrl: string;
  readonly profile: Profile;
  readonly reduced: boolean;
  /** Called once the first frame with the structure has been drawn. */
  readonly onFirstFrame?: (info: { readonly at: number }) => void;
  readonly onError?: (message: string) => void;
}

export interface StageHandle {
  dispose(): void;
}

/** Numbers the measuring harness reads (window.__physical). */
interface Probe {
  frames: number[];
  steps: number[];
  /** Post-to-reply time of each simulation frame, ms. */
  trips: number[];
  angle: number;
  progress: number;
  awake: boolean;
  fixed: boolean;
  firstFrameAt: number;
  hovered: number;
  particles: number;
  segments: number;
  /** The crown and the heaviest foundation, and where a file is on the stage (CSS px): for the test harness. */
  crown: number;
  heaviest: number;
  screenOf: (id: number) => [number, number];
}

const QUAD = new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]);
const QUAD_INDEX = [0, 1, 2, 0, 2, 3];
const BILLBOARD = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);

/**
 * The pointer's sweep. Moving across the model, the pointer moves air: past AIR_MIN (px/s) it blows a gust along
 * its ray, AIR_RADIUS px wide, at AIR_GAIN of its own speed carried to the model's depth (never faster than AIR_MAX
 * units/s). Past PICK_SPEED a sweep only stirs the chains; it does not light every file it crosses.
 */
const AIR_MIN = 260;
const AIR_RADIUS = 56;
const AIR_GAIN = 0.5;
const AIR_MAX = 11;
const PICK_SPEED = 700;

export async function startStage(el: StageElements, options: StageOptions): Promise<StageHandle> {
  const { profile, reduced } = options;
  const disposers: (() => void)[] = [];
  let disposed = false;

  // The worker starts fetching and building while the main thread does the same (both deterministic).
  const worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
  disposers.push(() => worker.terminate());
  const send = (message: ToWorker, transfer: Transferable[] = []) =>
    worker.postMessage(message, transfer);
  send({ type: "init", url: options.dataUrl, profile, mode: reduced ? "still" : "live" });

  const response = await fetch(options.dataUrl);
  const data = (await response.json()) as GraphData;
  if (disposed) return { dispose() {} };
  const built: Built = buildAll(data, profile);
  const { model, rig } = built;
  const particles = rig.spec.count;
  const segments = rig.segments;
  const files = rig.files;

  // Renderer.
  const renderer = new WebGLRenderer({
    canvas: el.canvas,
    antialias: false,
    alpha: false,
    powerPreference: "default",
    preserveDrawingBuffer: false,
  });
  renderer.setClearColor(0x0e1012, 1);
  disposers.push(() => renderer.dispose());
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV * (180 / Math.PI), 1, 1, 400);
  const board = new Group();
  board.matrixAutoUpdate = false;
  scene.add(board);

  // Textures written by the simulation.
  const posRows = texRows(particles);
  const forceRows = texRows(segments);
  const posData = new Float32Array(TEX_WIDTH * posRows * 4);
  for (let i = 0; i < particles; i++) {
    // Until the first frame: the net folded under the board, as the worker starts it.
    const held = rig.spec.invMass[i] !== 0;
    posData[i * 4] = rig.target[i * 3]!;
    posData[i * 4 + 1] = rig.target[i * 3 + 1]! * (held ? 0.08 : 1);
    posData[i * 4 + 2] = rig.target[i * 3 + 2]!;
  }
  const posTex = new DataTexture(posData, TEX_WIDTH, posRows, RGBAFormat, FloatType);
  posTex.minFilter = posTex.magFilter = NearestFilter;
  posTex.needsUpdate = true;
  const forceData = new Float32Array(TEX_WIDTH * forceRows);
  const forceTex = new DataTexture(forceData, TEX_WIDTH, forceRows, RedFormat, FloatType);
  forceTex.minFilter = forceTex.magFilter = NearestFilter;
  forceTex.needsUpdate = true;
  const force0Data = new Float32Array(TEX_WIDTH * forceRows);
  const force0Tex = new DataTexture(force0Data, TEX_WIDTH, forceRows, RedFormat, FloatType);
  force0Tex.minFilter = force0Tex.magFilter = NearestFilter;
  force0Tex.needsUpdate = true;
  disposers.push(() => {
    posTex.dispose();
    forceTex.dispose();
    force0Tex.dispose();
  });

  // Uniforms shared by every material.
  const shared = {
    uLight: { value: new Vector3(-0.45, 0.62, 0.64).normalize() },
    uFogNear: { value: 30 },
    uFogFar: { value: 60 },
    uViewport: { value: [1, 1] as [number, number] },
    uPixel: { value: 1 },
    uReveal: { value: reduced ? 1 : 0 },
    uDim: { value: 0 },
  } satisfies Record<string, IUniform>;

  // Chains.
  const chainGeometry = new InstancedBufferGeometry();
  chainGeometry.setAttribute("position", new BufferAttribute(QUAD, 3));
  chainGeometry.setIndex(QUAD_INDEX);
  const aA = new Float32Array(segments);
  const aB = new Float32Array(segments);
  const aSeg = new Float32Array(segments);
  const aLevel = new Float32Array(segments);
  for (let s = 0; s < segments; s++) {
    const a = rig.spec.segA[s]!;
    const b = rig.spec.segB[s]!;
    aA[s] = a;
    aB[s] = b;
    aSeg[s] = s;
    aLevel[s] = (rig.particleLevel[a]! + rig.particleLevel[b]!) / 2;
  }
  const chainHi = new Float32Array(segments);
  const chainHiAttr = new InstancedBufferAttribute(chainHi, 1);
  chainGeometry.setAttribute("aA", new InstancedBufferAttribute(aA, 1));
  chainGeometry.setAttribute("aB", new InstancedBufferAttribute(aB, 1));
  chainGeometry.setAttribute("aSeg", new InstancedBufferAttribute(aSeg, 1));
  chainGeometry.setAttribute("aLevel", new InstancedBufferAttribute(aLevel, 1));
  chainGeometry.setAttribute("aHi", chainHiAttr);
  chainGeometry.instanceCount = segments;
  const chainUniforms = {
    ...shared,
    uPos: { value: posTex },
    uForce: { value: forceTex },
    uForce0: { value: force0Tex },
    uFixed: { value: 0 },
    uLoadScale: { value: 1 },
    uForceScale: { value: 1 / 600 },
    uRefDepth: { value: 40 },
    uWMin: { value: profile === "mobile" ? 0.5 : 0.55 },
    uWMax: { value: profile === "mobile" ? 2.6 : 3.4 },
    uAMin: { value: 0.13 },
    uAMax: { value: 0.92 },
    uFront: { value: -100 },
    uFrontWidth: { value: 1.6 },
  };
  const chainMaterial = new ShaderMaterial({
    vertexShader: CHAIN_VERTEX,
    fragmentShader: LINE_FRAGMENT,
    uniforms: chainUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const chains = new Mesh(chainGeometry, chainMaterial);
  chains.frustumCulled = false;
  chains.renderOrder = 2;
  board.add(chains);

  // Weights.
  const weightGeometry = new InstancedBufferGeometry();
  weightGeometry.setAttribute("position", new BufferAttribute(BILLBOARD, 3));
  weightGeometry.setIndex(QUAD_INDEX);
  const wIndex = new Float32Array(files);
  const wRadius = new Float32Array(files);
  const wKind = new Float32Array(files);
  const weightHi = new Float32Array(files);
  model.nodes.forEach((node, i) => {
    wIndex[i] = i;
    wRadius[i] = rig.fileRadius[i]!;
    wKind[i] =
      node.kind === "foundation" ? 1 : node.kind === "entry" ? 2 : node.kind === "isolated" ? 3 : 0;
  });
  const weightHiAttr = new InstancedBufferAttribute(weightHi, 1);
  weightGeometry.setAttribute("aIndex", new InstancedBufferAttribute(wIndex, 1));
  weightGeometry.setAttribute("aRadius", new InstancedBufferAttribute(wRadius, 1));
  weightGeometry.setAttribute("aKind", new InstancedBufferAttribute(wKind, 1));
  weightGeometry.setAttribute("aHi", weightHiAttr);
  weightGeometry.instanceCount = files;
  const weightMaterial = new ShaderMaterial({
    vertexShader: WEIGHT_VERTEX,
    fragmentShader: WEIGHT_FRAGMENT,
    uniforms: { ...shared, uPos: { value: posTex }, uPxPerUnit: { value: 400 } },
    transparent: true,
    depthWrite: true,
    depthTest: true,
  });
  const weights = new Mesh(weightGeometry, weightMaterial);
  weights.frustumCulled = false;
  weights.renderOrder = 1;
  board.add(weights);

  // The board: plan, footings, hatching, level scale.
  const drawing = boardDrawing(built);
  const boardGeometry = new InstancedBufferGeometry();
  boardGeometry.setAttribute("position", new BufferAttribute(QUAD, 3));
  boardGeometry.setIndex(QUAD_INDEX);
  boardGeometry.setAttribute("aP0", new InstancedBufferAttribute(drawing.lines.p0, 3));
  boardGeometry.setAttribute("aP1", new InstancedBufferAttribute(drawing.lines.p1, 3));
  boardGeometry.setAttribute("aWidth", new InstancedBufferAttribute(drawing.lines.width, 1));
  boardGeometry.setAttribute("aAlpha", new InstancedBufferAttribute(drawing.lines.alpha, 1));
  boardGeometry.setAttribute("aTone", new InstancedBufferAttribute(drawing.lines.tone, 1));
  boardGeometry.instanceCount = drawing.lines.count;
  const boardMaterial = new ShaderMaterial({
    vertexShader: BOARD_VERTEX,
    fragmentShader: LINE_FRAGMENT,
    uniforms: { ...shared },
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const boardMesh = new Mesh(boardGeometry, boardMaterial);
  boardMesh.frustumCulled = false;
  boardMesh.renderOrder = 0;
  board.add(boardMesh);

  // The board's surface, under everything else.
  const planeGeometry = boardPlane(built);
  const planeMaterial = new ShaderMaterial({
    vertexShader: PLANE_VERTEX,
    fragmentShader: PLANE_FRAGMENT,
    uniforms: {
      uLight: shared.uLight,
      uFogNear: shared.uFogNear,
      uFogFar: shared.uFogFar,
      uReveal: shared.uReveal,
      uDim: shared.uDim,
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
  });
  const plane = new Mesh(planeGeometry, planeMaterial);
  plane.frustumCulled = false;
  plane.renderOrder = -1;
  board.add(plane);
  disposers.push(() => {
    chainGeometry.dispose();
    chainMaterial.dispose();
    weightGeometry.dispose();
    weightMaterial.dispose();
    boardGeometry.dispose();
    boardMaterial.dispose();
    planeGeometry.dispose();
    planeMaterial.dispose();
  });

  // The words on the drawing.
  const labels = createLabels(el.overlay, el.root, built, drawing.labels);
  const crownId = labels.crown;
  const heaviestId = labels.heaviest;
  void document.fonts?.ready.then(() => {
    labels.measure();
    dirty = true;
    schedule();
  });

  // State.
  const probe: Probe = {
    frames: [],
    steps: [],
    trips: [],
    angle: 0,
    progress: 0,
    awake: true,
    fixed: false,
    firstFrameAt: 0,
    hovered: -1,
    particles,
    segments,
    crown: crownId,
    heaviest: heaviestId,
    screenOf: (id) => {
      const [x, y] = project(
        filePositions[id * 3]!,
        filePositions[id * 3 + 1]!,
        filePositions[id * 3 + 2]!,
      );
      return [x, y];
    },
  };
  (window as unknown as { __physical?: Probe }).__physical = probe;

  let progress = 0;
  let angle = reduced ? Math.PI : 0;
  let fixed = reduced;
  let awake = !reduced;
  let forceScale = 600;
  let forceScaleTarget = 600;
  let inFlight = false;
  let workerReady = false;
  let lastPost = performance.now();
  let hasFrame = false;
  let dirty = true;
  let pose: CameraPose = reduced ? poseAt(END_PROGRESS, profile) : poseAt(0, profile);
  const filePositions = new Float32Array(files * 3);
  let returnPositions: Float32Array | null = null;
  let returnForces: Float32Array | null = null;
  let drag: DragInput | null = null;
  let dragPointer = -1;
  let hovered = -1;
  let selected = -1;
  let turned = false;
  // The pointer's last position and time (CSS px, ms) and its smoothed velocity (px/s).
  let sweepX = 0;
  let sweepY = 0;
  let sweepT = -1;
  let sweepVX = 0;
  let sweepVY = 0;
  /** A quick sweep skipped picking; pick where the pointer is once it slows down. */
  let sweepPick = false;
  let visible = true;
  let width = 1;
  let height = 1;
  let dpr = 1;

  const syncFilePositions = () => {
    for (let i = 0; i < files; i++) {
      filePositions[i * 3] = posData[i * 4]!;
      filePositions[i * 3 + 1] = posData[i * 4 + 1]!;
      filePositions[i * 3 + 2] = posData[i * 4 + 2]!;
    }
  };
  syncFilePositions();

  worker.onerror = (event) => {
    options.onError?.(`worker: ${event.message}`);
  };
  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const message = event.data;
    if (message.type === "error") {
      options.onError?.(message.message);
      return;
    }
    if (message.type === "ready") {
      workerReady = true;
      schedule();
      return;
    }
    if (message.type === "still") {
      posData.set(message.positions);
      forceData.set(message.forces);
      force0Data.set(message.forces);
      posTex.needsUpdate = true;
      forceTex.needsUpdate = true;
      force0Tex.needsUpdate = true;
      forceScale = forceScaleTarget = message.forceScale;
      syncFilePositions();
      hasFrame = true;
      dirty = true;
      schedule();
      return;
    }
    // A frame.
    inFlight = false;
    posData.set(message.positions);
    forceData.set(message.forces);
    posTex.needsUpdate = true;
    forceTex.needsUpdate = true;
    if (message.fixedForces !== null) {
      force0Data.set(message.fixedForces);
      force0Tex.needsUpdate = true;
    }
    returnPositions = message.positions;
    returnForces = message.forces;
    angle = message.angle;
    fixed = message.fixed;
    awake = message.awake;
    if (message.forceScale > 0) forceScaleTarget = message.forceScale;
    syncFilePositions();
    probe.steps.push(message.stepMs);
    probe.trips.push(performance.now() - lastPost);
    if (probe.steps.length > 2000) {
      probe.steps.splice(0, 1000);
      probe.trips.splice(0, 1000);
    }
    hasFrame = true;
    dirty = true;
    schedule();
  };

  // Size, and the frame the drawing may use (beside the words, or above them on phones).
  let textRight = 0;
  const resize = () => {
    const rect = el.root.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    shared.uViewport.value = [width * dpr, height * dpr];
    shared.uPixel.value = dpr;
    camera.aspect = width / height;
    textRight = textRightOf(el.run, rect.left);
    labels.measure();
    dirty = true;
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(el.root);
  disposers.push(() => resizeObserver.disconnect());

  // Visibility: no work while the stage is off screen or the tab is hidden.
  const intersection = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) schedule();
  });
  intersection.observe(el.root);
  disposers.push(() => intersection.disconnect());

  // Camera.
  const boardMatrix = new Matrix4();
  const pivotShift = new Matrix4().makeTranslation(0, -built.pivotY, 0);
  const viewProjection = new Matrix4();
  const full = new Matrix4();
  const hull = hullOf(built, drawing.labels, profile);
  const hullScratch = new Float64Array(hull.length);

  const applyCamera = () => {
    const frame = frameRect(profile, width, height, textRight, standingOf(angle));
    const fit = fitView(hull, angle, built.pivotY, pose, camera.aspect, frame, hullScratch);
    const d = fit.distance;
    const cp = Math.cos(pose.pitch);
    camera.position.set(
      d * cp * Math.sin(pose.yaw),
      d * Math.sin(pose.pitch),
      d * cp * Math.cos(pose.yaw),
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    // Generous planes: a tugged weight may leave the hull.
    camera.near = Math.max(0.5, fit.near * 0.5);
    camera.far = fit.far * 1.6 + 4;
    camera.updateProjectionMatrix();
    // Shift the image so the structure sits in its frame, beside the words, not under them.
    camera.projectionMatrix.elements[8] = -fit.shiftX;
    camera.projectionMatrix.elements[9] = -fit.shiftY;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld();
    const range = fit.far - fit.near;
    shared.uFogNear.value = fit.near + range * 0.2;
    shared.uFogFar.value = fit.far + range * 0.25;
    chainUniforms.uRefDepth.value = d;
    weightMaterial.uniforms.uPxPerUnit!.value = height / 2 / Math.tan(FOV / 2);
    boardMatrix.makeRotationZ(angle).multiply(pivotShift);
    board.matrix.copy(boardMatrix);
    board.matrixWorldNeedsUpdate = true;
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    full.multiplyMatrices(viewProjection, boardMatrix);
  };

  // Project a board-frame point to CSS pixels in the stage.
  const scratch = new Vector3();
  const project = (x: number, y: number, z: number): [number, number, number] => {
    scratch.set(x, y, z).applyMatrix4(full);
    return [(scratch.x * 0.5 + 0.5) * width, (-scratch.y * 0.5 + 0.5) * height, scratch.z];
  };

  // Highlight: the hovered (or selected) file and its load path down to the foundations.
  const applyHighlight = (id: number) => {
    chainHi.fill(0);
    weightHi.fill(0);
    if (id >= 0) {
      // The load path through the member: what it rests on, down to the ground, in full load blue; what rests on
      // it, the load it carries, in a fainter tone of the same blue.
      const down = loadPath(model, id);
      const up = restingOn(model, id);
      for (const f of up) weightHi[f] = 0.5;
      for (const f of down) weightHi[f] = 1;
      weightHi[id] = 2;
      model.chains.forEach((c, ci) => {
        const value = down.has(c.dependent)
          ? 1
          : up.has(c.dependency) && up.has(c.dependent)
            ? 0.5
            : 0;
        if (value === 0) return;
        const start = rig.chainStart[ci]!;
        const end = start + rig.chainLinks[ci]!;
        for (let s = start; s < end; s++) chainHi[s] = value;
      });
    }
    chainHiAttr.needsUpdate = true;
    weightHiAttr.needsUpdate = true;
    shared.uDim.value = id >= 0 ? 1 : 0;
    probe.hovered = id;
    dirty = true;
  };

  const describe = (id: number) => ({ node: model.nodes[id]!, meta: describeFile(model, id) });

  const showCard = (id: number) => {
    if (id < 0) {
      el.card.dataset.open = "false";
      return;
    }
    const { node, meta } = describe(id);
    el.cardDir.textContent = dirName(node.path);
    el.cardBase.textContent = baseName(node.path);
    el.cardMeta.replaceChildren(
      ...meta.map((m) => {
        const li = document.createElement("li");
        li.textContent = m;
        return li;
      }),
    );
    el.card.dataset.open = "true";
    placeCard(id);
  };

  const placeCard = (id: number) => {
    if (id < 0) return;
    const [sx, sy] = project(
      filePositions[id * 3]!,
      filePositions[id * 3 + 1]!,
      filePositions[id * 3 + 2]!,
    );
    const cw = el.card.offsetWidth || 220;
    const ch = el.card.offsetHeight || 90;
    let x = sx + 18;
    let y = sy - ch - 14;
    if (x + cw > width - 12) x = sx - cw - 18;
    if (y < 72) y = sy + 18;
    x = Math.min(Math.max(12, x), width - cw - 12);
    y = Math.min(Math.max(12, y), height - ch - 12);
    el.card.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  };

  const setActive = (id: number) => {
    const target = id;
    if (target === hovered) return;
    hovered = target;
    applyHighlight(target);
    showCard(target);
  };

  // Picking: nearest weight on screen, within reach of the pointer.
  const pick = (cx: number, cy: number): number => {
    let best = -1;
    let bestD = Infinity;
    const pxPerUnit = height / 2 / Math.tan(FOV / 2) / camera.position.length();
    for (let i = 0; i < files; i++) {
      scratch
        .set(filePositions[i * 3]!, filePositions[i * 3 + 1]!, filePositions[i * 3 + 2]!)
        .applyMatrix4(full);
      if (scratch.z > 1 || scratch.z < -1) continue;
      const sx = (scratch.x * 0.5 + 0.5) * width;
      const sy = (-scratch.y * 0.5 + 0.5) * height;
      const dx = sx - cx;
      const dy = sy - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const reach = Math.max(11, rig.fileRadius[i]! * pxPerUnit + 7);
      if (d < reach && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  // Tugging: the pointer drags a weight across a plane facing the camera through where the weight was.
  const dragPlanePoint = new Vector3();
  const dragNormal = new Vector3();
  const inverseBoard = new Matrix4();
  const rayOrigin = new Vector3();
  const rayDir = new Vector3();
  const hit = new Vector3();
  /** The ray under a point of the stage (CSS px), in world space: rayOrigin and rayDir. */
  const castRay = (cx: number, cy: number) => {
    const ndcX = (cx / width) * 2 - 1;
    const ndcY = -(cy / height) * 2 + 1;
    rayOrigin.copy(camera.position);
    rayDir.set(ndcX, ndcY, 0.5).unproject(camera).sub(rayOrigin).normalize();
  };
  const pointerToBoard = (cx: number, cy: number): DragInput | null => {
    if (dragPointer < 0 || drag === null) return null;
    castRay(cx, cy);
    const denom = rayDir.dot(dragNormal);
    if (Math.abs(denom) < 1e-6) return null;
    const t = hit.copy(dragPlanePoint).sub(rayOrigin).dot(dragNormal) / denom;
    hit.copy(rayOrigin).addScaledVector(rayDir, t);
    inverseBoard.copy(boardMatrix).invert();
    hit.applyMatrix4(inverseBoard);
    return { particle: drag.particle, x: hit.x, y: hit.y, z: hit.z };
  };

  // The air a sweeping pointer moves: its ray and its velocity, carried to the model's depth, in the board's frame.
  const camRight = new Vector3();
  const camUp = new Vector3();
  const airOf = (cx: number, cy: number, vx: number, vy: number): AirInput => {
    castRay(cx, cy);
    const unitsPerPx = (2 * camera.position.length() * Math.tan(FOV / 2)) / height;
    const pxSpeed = Math.hypot(vx, vy);
    const scale = Math.min(AIR_MAX, pxSpeed * unitsPerPx * AIR_GAIN) / Math.max(1e-6, pxSpeed);
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    // Screen y grows downwards.
    const wx = (camRight.x * vx - camUp.x * vy) * scale;
    const wy = (camRight.y * vx - camUp.y * vy) * scale;
    const wz = (camRight.z * vx - camUp.z * vy) * scale;
    // Into the board's frame: positions through the inverse of the board's matrix, directions through the inverse
    // of its turn (a rotation about z).
    inverseBoard.copy(boardMatrix).invert();
    hit.copy(rayOrigin).applyMatrix4(inverseBoard);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
      ox: hit.x,
      oy: hit.y,
      oz: hit.z,
      dx: rayDir.x * c + rayDir.y * s,
      dy: -rayDir.x * s + rayDir.y * c,
      dz: rayDir.z,
      vx: wx * c + wy * s,
      vy: -wx * s + wy * c,
      vz: wz,
      radius: AIR_RADIUS * unitsPerPx,
    };
  };
  const trackSweep = (event: PointerEvent, cx: number, cy: number) => {
    const dt = (event.timeStamp - sweepT) / 1000;
    if (sweepT >= 0 && dt > 0 && dt < 0.1) {
      sweepVX += ((cx - sweepX) / dt - sweepVX) * 0.5;
      sweepVY += ((cy - sweepY) / dt - sweepVY) * 0.5;
    } else {
      sweepVX = 0;
      sweepVY = 0;
    }
    sweepX = cx;
    sweepY = cy;
    sweepT = event.timeStamp;
  };

  const canTug = () => !reduced && hasFrame;
  const onPointerMove = (event: PointerEvent) => {
    const rect = el.canvas.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    if (dragPointer === event.pointerId && drag !== null) {
      const next = pointerToBoard(cx, cy);
      if (next !== null) drag = next;
      schedule();
      return;
    }
    trackSweep(event, cx, cy);
    if (event.pointerType === "mouse") {
      if (Math.hypot(sweepVX, sweepVY) > PICK_SPEED) {
        if (hovered !== selected) setActive(selected);
        sweepPick = true;
        el.canvas.style.cursor = "default";
      } else {
        sweepPick = false;
        const id = pick(cx, cy);
        setActive(id >= 0 ? id : selected);
        el.canvas.style.cursor =
          id >= 0 && canTug() && model.nodes[id]!.kind !== "foundation" ? "grab" : "default";
      }
    }
    schedule();
  };
  const onPointerDown = (event: PointerEvent) => {
    if (dragPointer >= 0) return; // one pointer at a time
    const rect = el.canvas.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const id = pick(cx, cy);
    if (id < 0) {
      if (event.pointerType !== "mouse") {
        selected = -1;
        setActive(-1);
      }
      return;
    }
    selected = id;
    setActive(id);
    if (!canTug() || model.nodes[id]!.kind === "foundation" || model.nodes[id]!.kind === "isolated")
      return;
    // Start a tug: plane through the weight, facing the camera.
    scratch
      .set(filePositions[id * 3]!, filePositions[id * 3 + 1]!, filePositions[id * 3 + 2]!)
      .applyMatrix4(boardMatrix);
    dragPlanePoint.copy(scratch);
    camera.getWorldDirection(dragNormal);
    dragPointer = event.pointerId;
    drag = {
      particle: id,
      x: filePositions[id * 3]!,
      y: filePositions[id * 3 + 1]!,
      z: filePositions[id * 3 + 2]!,
    };
    el.canvas.setPointerCapture(event.pointerId);
    el.canvas.style.cursor = "grabbing";
    schedule();
  };
  const endDrag = (event: PointerEvent) => {
    if (event.pointerId !== dragPointer) return;
    dragPointer = -1;
    drag = null;
    if (el.canvas.hasPointerCapture(event.pointerId))
      el.canvas.releasePointerCapture(event.pointerId);
    el.canvas.style.cursor = "grab";
    schedule();
  };
  const onPointerLeave = (event: PointerEvent) => {
    sweepPick = false;
    if (event.pointerType === "mouse" && dragPointer < 0) {
      setActive(selected);
      el.canvas.style.cursor = "default";
    }
  };
  el.canvas.addEventListener("pointermove", onPointerMove);
  el.canvas.addEventListener("pointerdown", onPointerDown);
  el.canvas.addEventListener("pointerup", endDrag);
  el.canvas.addEventListener("pointercancel", endDrag);
  el.canvas.addEventListener("pointerleave", onPointerLeave);
  disposers.push(() => {
    el.canvas.removeEventListener("pointermove", onPointerMove);
    el.canvas.removeEventListener("pointerdown", onPointerDown);
    el.canvas.removeEventListener("pointerup", endDrag);
    el.canvas.removeEventListener("pointercancel", endDrag);
    el.canvas.removeEventListener("pointerleave", onPointerLeave);
  });

  // Keyboard: the arrows walk the files level by level; Escape lets go.
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
        schedule();
      },
    ),
  );

  const placeLabels = (p: number) => {
    labels.place({
      progress: p,
      angle,
      yaw: pose.yaw,
      active: hovered,
      still: reduced,
      width,
      height,
      files: filePositions,
      project,
    });
  };

  // The loop.
  let raf = 0;
  let last = performance.now();
  let revealStart = -1;
  let firstReported = false;
  let lastProgress = -1;
  const schedule = () => {
    if (raf === 0 && !disposed) raf = requestAnimationFrame(tick);
  };

  const tick = (now: number) => {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    probe.frames.push(now);
    if (probe.frames.length > 4000) probe.frames.splice(0, 2000);

    // Camera: eased towards the pose the scroll asks for.
    const goal = reduced ? poseAt(END_PROGRESS, profile) : poseAt(progress, profile);
    const ease = reduced ? 1 : 1 - Math.exp(-dt * 3.2);
    const moving =
      Math.abs(goal.yaw - pose.yaw) +
        Math.abs(goal.pitch - pose.pitch) +
        Math.abs(goal.distance - pose.distance) >
      1e-4;
    if (moving) {
      pose = {
        yaw: pose.yaw + (goal.yaw - pose.yaw) * ease,
        pitch: pose.pitch + (goal.pitch - pose.pitch) * ease,
        distance: pose.distance + (goal.distance - pose.distance) * ease,
      };
      dirty = true;
    }

    // The pointer's sweep fades once it stops; while it is quick it moves air through the model.
    if (sweepT >= 0 && now - sweepT > 32) {
      const fade = Math.exp(-dt * 14);
      sweepVX *= fade;
      sweepVY *= fade;
    }
    const sweepSpeed = Math.hypot(sweepVX, sweepVY);
    const air =
      !reduced && hasFrame && drag === null && sweepSpeed > AIR_MIN
        ? airOf(sweepX, sweepY, sweepVX, sweepVY)
        : null;
    if (sweepPick && sweepSpeed < PICK_SPEED && dragPointer < 0) {
      sweepPick = false;
      const id = pick(sweepX, sweepY);
      setActive(id >= 0 ? id : selected);
    }

    // Simulation: one step in flight at a time.
    if (!reduced) turned = flipTarget(progress, turned);
    const flip = reduced || turned ? 1 : 0;
    if (
      !reduced &&
      workerReady &&
      !inFlight &&
      (awake ||
        drag !== null ||
        air !== null ||
        Math.abs(flip * Math.PI - angle) > 1e-3 ||
        progress !== lastProgress)
    ) {
      const transfer: Transferable[] = [];
      if (returnPositions !== null) transfer.push(returnPositions.buffer);
      if (returnForces !== null) transfer.push(returnForces.buffer);
      send(
        {
          type: "frame",
          dt: Math.min(1 / 30, (now - lastPost) / 1000),
          flip,
          drag,
          air,
          positions: returnPositions,
          forces: returnForces,
        },
        transfer,
      );
      returnPositions = null;
      returnForces = null;
      inFlight = true;
      lastPost = now;
    } else if (!inFlight) {
      lastPost = now;
    }
    lastProgress = progress;

    // Reveal once the first simulated frame is in.
    if (hasFrame && revealStart < 0) revealStart = now;
    if (!reduced && revealStart >= 0 && shared.uReveal.value < 1) {
      shared.uReveal.value = Math.min(1, (now - revealStart) / 700);
      dirty = true;
    }

    // Line weights: eased towards the measured scale; once fixed, scaled by the load still along each member.
    if (Math.abs(forceScaleTarget - forceScale) > 0.5) {
      forceScale += (forceScaleTarget - forceScale) * Math.min(1, dt * 2);
      dirty = true;
    }
    chainUniforms.uForceScale.value = 1 / Math.max(1, forceScale);
    chainUniforms.uFixed.value = fixed ? 1 : 0;
    chainUniforms.uLoadScale.value = Math.max(0.04, Math.abs(Math.cos(angle)));
    // The front of load blue: it runs from the foundations to the crown as the board passes the vertical.
    const a0 = Math.PI * 0.32;
    const a1 = Math.PI * 0.78;
    if (fixed && angle > a0 && angle < a1) {
      chainUniforms.uFront.value = -2 + ((angle - a0) / (a1 - a0)) * (model.maxLevel + 4);
    } else {
      chainUniforms.uFront.value = -100;
    }

    probe.angle = angle;
    probe.progress = progress;
    probe.awake = awake;
    probe.fixed = fixed;

    if ((dirty || moving) && hasFrame) {
      applyCamera();
      renderer.render(scene, camera);
      placeLabels(reduced ? 1 : progress);
      if (hovered >= 0) placeCard(hovered);
      dirty = false;
      if (!firstReported) {
        firstReported = true;
        probe.firstFrameAt = performance.now();
        options.onFirstFrame?.({ at: probe.firstFrameAt });
      }
    }

    const busy =
      !reduced &&
      (awake ||
        inFlight ||
        drag !== null ||
        air !== null ||
        sweepPick ||
        moving ||
        shared.uReveal.value < 1);
    if (visible && !document.hidden && (busy || dirty)) schedule();
  };

  const onVisibility = () => {
    if (!document.hidden) {
      last = performance.now();
      schedule();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  disposers.push(() => document.removeEventListener("visibilitychange", onVisibility));

  // Scroll: progress through the tall section sets targets; it never moves anything directly.
  if (!reduced) {
    gsap.registerPlugin(ScrollTrigger);
    const trigger = ScrollTrigger.create({
      trigger: el.run,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        progress = self.progress;
        schedule();
      },
    });
    progress = trigger.progress;
    disposers.push(() => trigger.kill());
  }
  const onContextLost = (event: Event) => {
    event.preventDefault();
    options.onError?.("webgl context lost");
  };
  el.canvas.addEventListener("webglcontextlost", onContextLost);
  disposers.push(() => el.canvas.removeEventListener("webglcontextlost", onContextLost));

  schedule();

  return {
    dispose() {
      disposed = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      for (const d of disposers.reverse()) d();
      el.overlay.replaceChildren();
    },
  };
}

/** The board as a disc (a fan of triangles out to the board's edge), with the relative radius per vertex. */
function boardPlane(built: Built): BufferGeometry {
  const n = 96;
  const position = new Float32Array((n + 1) * 3);
  const radius = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const [x, z] = planPoint(built.plan, (Math.PI * 2 * i) / n, 1.16);
    position.set([x, 0, z], (i + 1) * 3);
    radius[i + 1] = 1;
  }
  const index: number[] = [];
  // Wound so the front face is the top (+y): gl_FrontFacing tells the plane which side the camera sees.
  for (let i = 0; i < n; i++) index.push(0, 1 + i, 1 + ((i + 1) % n));
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("aR", new BufferAttribute(radius, 1));
  geometry.setIndex(index);
  return geometry;
}
