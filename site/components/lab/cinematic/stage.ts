/**
 * The WebGL stage: the hanging model of CodeVerse, its turn, and the camera that films it. Loaded on demand
 * (dynamic import) and only for the film, so three.js never blocks the first paint and the still drawing (reduced
 * motion, no WebGL 2) never downloads it. Five draw calls: the board, its wall, the chains, the lit chains and the
 * joints. Frames are skipped whenever nothing on screen would change.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DoubleSide,
  FloatType,
  GLSL3,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  Mesh,
  NearestFilter,
  NormalBlending,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  type IUniform,
} from "three";
import { inkOf, PLAN_MINOR, PLAN_RADIUS, PLAN_TURN, SLAB, type HangingModel } from "./model";
import {
  BOARD_FRAG,
  BOARD_VERT,
  CHAIN_FRAG,
  CHAIN_VERT,
  JOINT_FRAG,
  JOINT_VERT,
  WALL_FRAG,
  WALL_VERT,
} from "./shaders";
import { HangingSim, POS_WIDTH } from "./sim";
import {
  BEAT,
  INTRO,
  buildCamera,
  flashOf,
  freezeOf,
  lensFov,
  modelHeight,
  modelMatrix,
  penOf,
  releasedLevel,
  turnAxis,
  turnOf,
  waveFront,
  windOf,
  type CameraState,
  type Framing,
} from "./timeline";

const SHEET = [0x0e / 255, 0x10 / 255, 0x12 / 255] as const;
const CHALK = [0xe9 / 255, 0xe6 / 255, 0xdf / 255] as const;
const GRAPHITE = [0x5d / 255, 0x61 / 255, 0x66 / 255] as const;
const BLUE = [0x3e / 255, 0xa6 / 255, 0xff / 255] as const;

export interface StageOptions {
  readonly canvas: HTMLCanvasElement;
  readonly model: HangingModel;
  readonly framing: Framing;
  readonly pixelRatio: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** Distance from the camera, model units. */
  depth: number;
  visible: boolean;
}

export class Stage {
  readonly model: HangingModel;
  readonly sim: HangingSim;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 500);
  private readonly root = new Group();
  private readonly posTexture: DataTexture;
  private readonly shared: Record<string, IUniform>;
  private readonly boardUniforms: Record<string, IUniform>;
  private readonly chainInfo: InstancedBufferAttribute;
  private readonly jointInfo: InstancedBufferAttribute;
  private readonly height: number;
  private framing: Framing;
  private camAt: (p: number, out: CameraState) => CameraState;
  private readonly cam: CameraState = {
    eye: [0, 0, 0],
    target: [0, 0, 0],
    fov: 30,
    lensX: 0,
    lensY: 0,
  };
  private width = 1;
  private heightPx = 1;
  private pixelRatio: number;
  private focus = 0;
  private focusTarget = 0;
  private lastP = -1;
  private dirty = true;
  private readonly vp = new Matrix4();
  private readonly mvp = new Matrix4();
  private readonly v4 = new Vector4();
  private readonly turnMatrix = new Float32Array(16);
  /** The turn the model matrix was last built for (-1: build it on the next frame). */
  private lastTurn = -1;
  /** The simulation version last sent to the GPU. */
  private uploaded = -1;

  constructor(options: StageOptions) {
    const { canvas, model, framing, pixelRatio } = options;
    this.model = model;
    this.framing = framing;
    this.pixelRatio = pixelRatio;
    this.height = modelHeight(model);
    this.camAt = buildCamera(model, framing);

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.renderer.setClearColor(0x0e1012, 1);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.autoClear = true;

    this.sim = new HangingSim(model);
    const rows = Math.ceil(model.n / POS_WIDTH);
    this.posTexture = new DataTexture(this.sim.pos, POS_WIDTH, rows, RGBAFormat, FloatType);
    this.posTexture.minFilter = NearestFilter;
    this.posTexture.magFilter = NearestFilter;
    this.posTexture.generateMipmaps = false;
    this.posTexture.needsUpdate = true;

    this.shared = {
      uPos: { value: this.posTexture },
      uViewport: { value: new Vector2(1, 1) },
      uPx: { value: pixelRatio },
      uWidth: { value: framing === "wide" ? 3.7 : 2.9 },
      uRefDist: { value: framing === "wide" ? 44 : 60 },
      uFocus: { value: 0 },
      uDim: { value: 0.78 },
      uLitPass: { value: 0 },
      uWave: { value: -100 },
      uFlash: { value: 0 },
      uFadeNear: { value: 30 },
      uFadeFar: { value: 60 },
      uFadeAmount: { value: 0.62 },
      uAlpha: { value: 1 },
      uChalk: { value: new Vector3(...CHALK) },
      uBlue: { value: new Vector3(...BLUE) },
      uSheet: { value: new Vector3(...SHEET) },
    };

    // The board (ground once turned): the band of foundations, hatched.
    this.boardUniforms = {
      uAxes: { value: new Vector2(PLAN_RADIUS, PLAN_MINOR) },
      uNormal: { value: new Vector3(0, 1, 0) },
      uGraphite: { value: new Vector3(...GRAPHITE) },
      uChalk: { value: new Vector3(...CHALK) },
      uOpacity: { value: 1 },
      uPx: this.shared.uPx!,
      uDraw: { value: 0 },
      uStart: { value: PLAN_TURN },
      uSlab: { value: SLAB },
    };
    const boardGeometry = new PlaneGeometry(PLAN_RADIUS * 2.5, PLAN_MINOR * 2.5, 1, 1);
    boardGeometry.rotateX(-Math.PI / 2);
    const board = new Mesh(
      boardGeometry,
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: BOARD_VERT,
        fragmentShader: BOARD_FRAG,
        uniforms: this.boardUniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: NormalBlending,
      }),
    );
    board.renderOrder = 0;
    board.frustumCulled = false;

    const wall = new Mesh(
      wallGeometry(),
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: WALL_VERT,
        fragmentShader: WALL_FRAG,
        uniforms: this.boardUniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: NormalBlending,
        side: DoubleSide,
      }),
    );
    wall.renderOrder = 0;
    wall.frustumCulled = false;

    // Chains: one ribbon per runtime dependency, instanced.
    const segments = framing === "wide" ? 18 : 14;
    const verts = (segments + 1) * 2;
    const aT = new Float32Array(verts);
    const aSide = new Float32Array(verts);
    for (let i = 0; i <= segments; i++) {
      aT[i * 2] = aT[i * 2 + 1] = i / segments;
      aSide[i * 2] = -1;
      aSide[i * 2 + 1] = 1;
    }
    const index: number[] = [];
    for (let i = 0; i < segments; i++)
      index.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    const chainGeometry = new InstancedBufferGeometry();
    chainGeometry.setAttribute("position", new BufferAttribute(new Float32Array(verts * 3), 3));
    chainGeometry.setAttribute("aT", new BufferAttribute(aT, 1));
    chainGeometry.setAttribute("aSide", new BufferAttribute(aSide, 1));
    chainGeometry.setIndex(index);
    const m = model.m;
    const ends = new Float32Array(m * 2);
    const info = new Float32Array(m * 4);
    const levels = new Float32Array(m * 2);
    for (let k = 0; k < m; k++) {
      const a = model.edgeA[k]!;
      const b = model.edgeB[k]!;
      ends[k * 2] = a;
      ends[k * 2 + 1] = b;
      info[k * 4] = model.edgeSag[k]!;
      info[k * 4 + 1] = model.edgeLength[k]!;
      info[k * 4 + 2] = inkOf(Math.sqrt(model.edgeLoad[k]! / model.maxEdgeLoad));
      info[k * 4 + 3] = 0;
      levels[k * 2] = model.level[a]!;
      levels[k * 2 + 1] = model.level[b]!;
    }
    chainGeometry.setAttribute("iEnds", new InstancedBufferAttribute(ends, 2));
    this.chainInfo = new InstancedBufferAttribute(info, 4);
    chainGeometry.setAttribute("iInfo", this.chainInfo);
    chainGeometry.setAttribute("iLevels", new InstancedBufferAttribute(levels, 2));
    chainGeometry.instanceCount = m;
    const chainMaterial = (litPass: number) =>
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: CHAIN_VERT,
        fragmentShader: CHAIN_FRAG,
        uniforms: { ...this.shared, uLitPass: { value: litPass } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: NormalBlending,
        // A ribbon can twist where a chain passes close to the lens: draw both faces.
        side: DoubleSide,
      });
    const chains = new Mesh(chainGeometry, chainMaterial(0));
    chains.renderOrder = 1;
    chains.frustumCulled = false;
    const litChains = new Mesh(chainGeometry, chainMaterial(1));
    litChains.renderOrder = 2;
    litChains.frustumCulled = false;

    // Joints: a ring per file (a solid disc per foundation), instanced.
    const jointGeometry = new InstancedBufferGeometry();
    jointGeometry.setAttribute("position", new BufferAttribute(new Float32Array(12), 3));
    jointGeometry.setAttribute(
      "aCorner",
      new BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2),
    );
    jointGeometry.setIndex([0, 1, 2, 0, 2, 3]);
    const jinfo = new Float32Array(model.n * 4);
    // Draw the heaviest last so they sit on top.
    const byLines = [...Array(model.n).keys()].sort((p, q) => model.lines[p]! - model.lines[q]!);
    byLines.forEach((v, i) => {
      jinfo[i * 4] = v;
      jinfo[i * 4 + 1] = model.radius[v]!;
      jinfo[i * 4 + 2] = model.foundation[v] === 1 ? 1 : model.level[v] === 0 ? 2 : 0;
      jinfo[i * 4 + 3] = 0;
    });
    this.jointInfo = new InstancedBufferAttribute(jinfo, 4);
    jointGeometry.setAttribute("iInfo", this.jointInfo);
    jointGeometry.instanceCount = model.n;
    const joints = new Mesh(
      jointGeometry,
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: JOINT_VERT,
        fragmentShader: JOINT_FRAG,
        uniforms: this.shared,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: NormalBlending,
      }),
    );
    joints.renderOrder = 3;
    joints.frustumCulled = false;
    this.jointOrder = byLines;

    this.root.matrixAutoUpdate = false;
    this.root.add(board, wall, chains, litChains, joints);
    this.scene.add(this.root);
  }

  private readonly jointOrder: number[];

  setFraming(framing: Framing): void {
    if (framing === this.framing) return;
    this.framing = framing;
    this.camAt = buildCamera(this.model, framing);
    this.shared.uWidth!.value = framing === "wide" ? 3.7 : 2.9;
    this.shared.uRefDist!.value = framing === "wide" ? 44 : 60;
    // The turn axis follows the framing (the model turns in the picture plane): rebuild the model matrix even when
    // the turn itself has not moved (a phone rotated after the turn, for instance).
    this.lastTurn = -1;
    this.dirty = true;
  }

  resize(width: number, height: number, pixelRatio = this.pixelRatio): void {
    this.width = Math.max(1, width);
    this.heightPx = Math.max(1, height);
    this.pixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.width, this.heightPx, false);
    (this.shared.uViewport!.value as Vector2).set(
      this.width * pixelRatio,
      this.heightPx * pixelRatio,
    );
    this.shared.uPx!.value = pixelRatio;
    this.dirty = true;
  }

  get dpr(): number {
    return this.pixelRatio;
  }

  /** Lights a load path (or clears it with null); `dim` is how far everything else steps back (0..1). */
  setLit(nodes: Uint8Array | null, edges: Uint8Array | null, dim = 0.78): void {
    if (nodes !== null) this.shared.uDim!.value = dim;
    const info = this.chainInfo.array as Float32Array;
    for (let k = 0; k < this.model.m; k++)
      info[k * 4 + 3] = edges !== null && edges[k] === 1 ? 1 : 0;
    this.chainInfo.needsUpdate = true;
    const jinfo = this.jointInfo.array as Float32Array;
    this.jointOrder.forEach((v, i) => {
      jinfo[i * 4 + 3] = nodes !== null && nodes[v] === 1 ? 1 : 0;
    });
    this.jointInfo.needsUpdate = true;
    this.focusTarget = nodes === null ? 0 : 1;
    this.dirty = true;
  }

  /**
   * True when the stage would draw nothing new until something outside it changes (scroll, a trace, a resize):
   * the opening is over, the model has come to rest and the trace has finished lighting. The page's frame loop
   * stops then.
   */
  get idle(): boolean {
    return (
      this.sim.still &&
      this.sim.clock > INTRO.release &&
      this.sim.clock > INTRO.penStart + INTRO.pen &&
      Math.abs(this.focus - this.focusTarget) <= 0.002 &&
      !this.dirty
    );
  }

  /**
   * Advances the physics and draws the frame for progress p. `calm` (0..1) scales the breath of the hanging model:
   * the page lowers it when nobody has touched it for a while, so a model left on screen comes to rest.
   * Returns false when the frame was skipped.
   */
  frame(p: number, dt: number, calm = 1): boolean {
    const model = this.model;
    const pp = p;
    const turn = turnOf(pp);
    const freeze = turn > 0 ? 1 : freezeOf(pp);
    // The opening: the pen draws the plan, the foundations land, then the first weights drop.
    const released = this.sim.clock < INTRO.release ? 0 : releasedLevel(pp, model.maxLevel);
    this.sim.step(dt, { released, wind: windOf(pp) * calm, freeze });
    const draw = penOf((this.sim.clock - INTRO.penStart) / INTRO.pen);
    const drawing = draw !== this.boardUniforms.uDraw!.value;
    this.boardUniforms.uDraw!.value = draw;
    const focusMoving = Math.abs(this.focus - this.focusTarget) > 0.002;
    if (focusMoving) this.focus += (this.focusTarget - this.focus) * (1 - Math.exp(-dt / 0.07));
    else this.focus = this.focusTarget;
    // A sleeping simulation keeps its version: with the camera where it was, there is nothing new to draw.
    const pChanged = Math.abs(pp - this.lastP) > 1e-5 || this.sim.version !== this.uploaded;
    if (!focusMoving && !pChanged && !drawing && !this.dirty) return false;
    this.lastP = pp;
    this.dirty = false;

    // The turn.
    if (turn !== this.lastTurn) {
      modelMatrix(this.height, turn, turnAxis(this.framing), this.turnMatrix);
      this.root.matrix.fromArray(this.turnMatrix);
      this.root.matrixWorldNeedsUpdate = true;
      const e = this.turnMatrix;
      (this.boardUniforms.uNormal!.value as Vector3).set(e[4]!, e[5]!, e[6]!).normalize();
      this.lastTurn = turn;
    }

    // The camera.
    const c = this.camAt(pp, this.cam);
    const cam = this.camera;
    cam.position.set(c.eye[0], c.eye[1], c.eye[2]);
    cam.up.set(0, 1, 0);
    cam.lookAt(c.target[0], c.target[1], c.target[2]);
    cam.aspect = this.width / this.heightPx;
    cam.fov = lensFov(c.fov, cam.aspect, this.framing);
    cam.updateProjectionMatrix();
    cam.projectionMatrix.elements[8] = -c.lensX;
    cam.projectionMatrix.elements[9] = -c.lensY;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    // Depth fade: the far side of the model steps back, measured from the model's centre; inside it, none.
    const dc = Math.hypot(c.eye[0], c.eye[1] - this.height / 2, c.eye[2]);
    this.shared.uFadeNear!.value = dc - 4;
    this.shared.uFadeFar!.value = dc + 14;
    this.shared.uFadeAmount!.value = 0.62 * smooth01(9, 30, dc);

    this.shared.uFocus!.value = this.focus;
    this.shared.uFlash!.value = flashOf(pp) * 0.9;
    this.shared.uWave!.value =
      pp < BEAT.turnEnd - 0.02 || pp > BEAT.waveEnd + 0.02 ? -100 : waveFront(pp, model.maxLevel);
    this.boardUniforms.uOpacity!.value = 1;
    if (this.sim.version !== this.uploaded) {
      this.posTexture.needsUpdate = true;
      this.uploaded = this.sim.version;
    }

    this.renderer.render(this.scene, cam);
    this.vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.mvp.multiplyMatrices(this.vp, this.root.matrix);
    return true;
  }

  /** Where a world-space point is on screen (CSS pixels), from the last rendered frame. */
  screenOfWorld(x: number, y: number, z: number, out: ScreenPoint): ScreenPoint {
    this.v4.set(x, y, z, 1).applyMatrix4(this.vp);
    const w = this.v4.w;
    out.visible = w > 0.5;
    out.x = ((this.v4.x / w) * 0.5 + 0.5) * this.width;
    out.y = (0.5 - (this.v4.y / w) * 0.5) * this.heightPx;
    out.depth = w;
    return out;
  }

  /** The current framing's turn axis and the model's height (for overlays that turn with the model). */
  get turnGeometry(): { axis: "x" | "z"; height: number } {
    return { axis: turnAxis(this.framing), height: this.height };
  }

  /** Where file v is on screen (CSS pixels), from the last rendered frame. */
  screenOf(v: number, out: ScreenPoint): ScreenPoint {
    const pos = this.sim.pos;
    this.v4.set(pos[v * 4]!, pos[v * 4 + 1]!, pos[v * 4 + 2]!, 1).applyMatrix4(this.mvp);
    const w = this.v4.w;
    out.visible = w > 0.5 && pos[v * 4 + 3]! > 0.4;
    out.x = ((this.v4.x / w) * 0.5 + 0.5) * this.width;
    out.y = (0.5 - (this.v4.y / w) * 0.5) * this.heightPx;
    out.depth = w;
    if (out.x < -40 || out.y < -40 || out.x > this.width + 40 || out.y > this.heightPx + 40)
      out.visible = false;
    return out;
  }

  /** The file under a point (CSS pixels), or -1. */
  pick(x: number, y: number, slop: number): number {
    const pt: ScreenPoint = { x: 0, y: 0, depth: 0, visible: false };
    const pxPerUnit = (this.camera.projectionMatrix.elements[5]! * this.heightPx) / 2;
    let best = -1;
    let bestScore = Infinity;
    for (let v = 0; v < this.model.n; v++) {
      this.screenOf(v, pt);
      if (!pt.visible) continue;
      const r = Math.max(3, (this.model.radius[v]! * pxPerUnit) / pt.depth);
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d > r + slop) continue;
      // Prefer the nearest ring edge, then the nearer file.
      const score = Math.max(0, d - r) + pt.depth * 0.01;
      if (score < bestScore) {
        bestScore = score;
        best = v;
      }
    }
    return best;
  }

  /** Draws the next frame even if nothing seems to have changed (a restored context has an empty buffer). */
  invalidate(): void {
    this.dirty = true;
    this.uploaded = -1;
  }

  dispose(): void {
    this.scene.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        (o.material as ShaderMaterial).dispose();
      }
    });
    this.posTexture.dispose();
    const canvas = this.renderer.domElement;
    this.renderer.dispose();
    // Unmounted for good (the canvas has left the document): release the context now rather than whenever the
    // canvas is collected, so navigating away and back never piles up live WebGL contexts. A remount in place
    // (fast refresh, strict mode) keeps the canvas in the document and needs its context alive.
    if (!canvas.isConnected) this.renderer.forceContextLoss();
  }
}

function smooth01(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The wall round the outer edge of the band: a ring of quads from the plan (y = 0) up to the slab's far face. */
function wallGeometry(): BufferGeometry {
  const segments = 192;
  const r = 1.145;
  const position = new Float32Array((segments + 1) * 2 * 3);
  const aS = new Float32Array((segments + 1) * 2);
  const aQ = new Float32Array((segments + 1) * 2);
  const aH = new Float32Array((segments + 1) * 2);
  let s = 0;
  let px = 0;
  let pz = 0;
  for (let i = 0; i <= segments; i++) {
    const q = i / segments;
    const t = PLAN_TURN + q * Math.PI * 2;
    const x = Math.cos(t) * PLAN_RADIUS * r;
    const z = Math.sin(t) * PLAN_MINOR * r;
    if (i > 0) s += Math.hypot(x - px, z - pz);
    px = x;
    pz = z;
    for (let h = 0; h < 2; h++) {
      const o = i * 2 + h;
      position[o * 3] = x;
      position[o * 3 + 1] = h * SLAB;
      position[o * 3 + 2] = z;
      aS[o] = s;
      aQ[o] = q;
      aH[o] = h;
    }
  }
  const index: number[] = [];
  for (let i = 0; i < segments; i++)
    index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(position, 3));
  g.setAttribute("aS", new BufferAttribute(aS, 1));
  g.setAttribute("aQ", new BufferAttribute(aQ, 1));
  g.setAttribute("aH", new BufferAttribute(aH, 1));
  g.setIndex(index);
  return g;
}
