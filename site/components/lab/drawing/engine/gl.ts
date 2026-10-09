import {
  AddEquation,
  BufferAttribute,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  GLSL3,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  RawShaderMaterial,
  Scene,
  WebGLRenderer,
} from "three";
import { RECORD } from "./catenary";
import { DOT } from "./layers";
import type { DrawingRenderer, Palette, RendererFactory } from "./layers";
import type { Camera } from "./view";

/**
 * The WebGL drawing. Two instanced layers and one shared set of uniforms:
 *
 * Lines: every chain (and every construction line) is one instance of a ribbon of SEGMENTS quads. The vertex
 * shader samples the chain's catenary by arc length (the same formula as `sampleCatenary`), turns the point
 * about the board line, projects it orthographically and offsets it across the line in screen space, so a
 * line is exactly `width` CSS px wide at any scale. Lines thinner than a device pixel keep a one-pixel ribbon
 * and fade instead (the ink a hairline would cover), which is how drafting film reads a 0.13 mm pen.
 *
 * Joints: one instanced quad per file, a disc (a weight) or a ring with an opaque sheet-coloured face (a pin).
 *
 * Nothing in the turn-over touches the instance data: the turn is two uniforms.
 */

export const SEGMENTS = 24;

const LINE_VERTEX = /* glsl */ `
precision highp float;
in vec2 aRib;
in vec4 iA;
in vec4 iB;
in vec4 iC;
in vec4 iD;
uniform vec2 uView;
uniform float uDpr;
uniform vec3 uCam;
uniform vec2 uRot;
uniform vec2 uDepth;
out float vAcross;
out float vHalf;
out float vWidth;
out float vT;
out float vLit;
out vec4 vColor;

vec3 chainPoint(float t) {
  float a = iA.w;
  if (a == 0.0) return mix(iA.xyz, iB.xyz, t);
  float sA = iB.w;
  float ds = (iC.x - sA) * t;
  float s = sA + ds;
  float X = iB.z + a * asinh(s / a);
  float Y = ds * (s + sA) / (sqrt(a * a + s * s) + sqrt(a * a + sA * sA));
  return vec3(iA.x + iB.x * X, iA.y + Y, iA.z + iB.y * X);
}

vec3 project(vec3 p) {
  float yr = p.y * uRot.x - p.z * uRot.y;
  float zr = p.y * uRot.y + p.z * uRot.x;
  return vec3(uCam.x + p.x * uCam.z, uCam.y - yr * uCam.z, zr);
}

void main() {
  float t = aRib.x;
  float h = 0.5 / ${SEGMENTS}.0;
  vec3 p = project(chainPoint(t));
  vec3 pa = project(chainPoint(max(t - h, 0.0)));
  vec3 pb = project(chainPoint(min(t + h, 1.0)));
  vec2 dir = pb.xy - pa.xy;
  float len = length(dir);
  dir = len > 1e-6 ? dir / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);

  float widthDev = iC.y * uDpr;
  float drawn = max(widthDev, 1.0);
  float halfExtent = drawn * 0.5 + 1.0;
  vec2 screen = p.xy + normal * aRib.y * halfExtent / uDpr;
  gl_Position = vec4(screen.x / uView.x * 2.0 - 1.0, 1.0 - screen.y / uView.y * 2.0, 0.0, 1.0);

  float near = clamp((p.z - uDepth.x) / max(uDepth.y - uDepth.x, 1e-4), 0.0, 1.0);
  float depthShade = mix(1.0 - 0.5 * iD.w, 1.0, near);
  vAcross = aRib.y;
  vHalf = halfExtent;
  vWidth = drawn;
  vT = t;
  vLit = iC.w;
  vColor = vec4(iD.rgb, iC.z * min(widthDev, 1.0) * depthShade);
}
`;

const LINE_FRAGMENT = /* glsl */ `
precision highp float;
in float vAcross;
in float vHalf;
in float vWidth;
in float vT;
in float vLit;
in vec4 vColor;
uniform vec3 uLoad;
uniform float uFade;
out vec4 fragColor;

void main() {
  float d = abs(vAcross) * vHalf;
  float cover = clamp(vWidth * 0.5 + 0.5 - d, 0.0, 1.0);
  float lit = vLit >= 1.0 ? 1.0 : 1.0 - smoothstep(vLit - 0.012, vLit + 0.012, vT);
  vec3 colour = mix(vColor.rgb, uLoad, lit * step(0.0001, vLit));
  // A lit stretch keeps full strength through the fade: the load path stays legible in any view.
  float alpha = cover * vColor.a * mix(uFade, 1.0, lit * step(0.0001, vLit));
  fragColor = vec4(colour * alpha, alpha);
}
`;

const DOT_VERTEX = /* glsl */ `
precision highp float;
in vec2 aCorner;
in vec4 iP;
in vec4 iC;
in vec4 iK;
uniform vec2 uView;
uniform float uDpr;
uniform vec3 uCam;
uniform vec2 uRot;
out vec2 vLocal;
out float vRadius;
out vec4 vColor;
out vec4 vKind;

void main() {
  float yr = iP.y * uRot.x - iP.z * uRot.y;
  vec2 centre = vec2(uCam.x + iP.x * uCam.z, uCam.y - yr * uCam.z);
  float radius = iP.w * uDpr;
  float extent = radius + 1.5;
  vec2 screen = centre + aCorner * extent / uDpr;
  gl_Position = vec4(screen.x / uView.x * 2.0 - 1.0, 1.0 - screen.y / uView.y * 2.0, 0.0, 1.0);
  vLocal = aCorner * extent;
  vRadius = radius;
  vColor = iC;
  vKind = vec4(iK.x, iK.y * uDpr, iK.z, iK.w);
}
`;

const DOT_FRAGMENT = /* glsl */ `
precision highp float;
in vec2 vLocal;
in float vRadius;
in vec4 vColor;
in vec4 vKind;
uniform vec3 uSheet;
out vec4 fragColor;

void main() {
  float d = length(vLocal);
  float outer = clamp(vRadius - d + 0.5, 0.0, 1.0);
  if (vKind.x < 0.5) {
    float a = outer * vColor.a;
    fragColor = vec4(vColor.rgb * a, a);
    return;
  }
  // A pin: a ring of stroke width vKind.y around an opaque face of the sheet.
  float inner = clamp(vRadius - vKind.y - d + 0.5, 0.0, 1.0);
  float ring = (outer - inner) * vColor.a;
  float face = inner * vColor.a;
  vec3 colour = vColor.rgb * ring + uSheet * face;
  fragColor = vec4(colour, ring + face);
}
`;

function blendPremultiplied(material: RawShaderMaterial) {
  // Screen-space quads are wound either way once y is flipped to the screen: draw both faces.
  material.side = DoubleSide;
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.blending = CustomBlending;
  material.blendEquation = AddEquation;
  material.blendSrc = OneFactor;
  material.blendDst = OneMinusSrcAlphaFactor;
}

export class InstanceLayer {
  readonly data: Float32Array;
  readonly mesh: Mesh;
  private readonly buffer: InstancedInterleavedBuffer;
  private readonly geometry: InstancedBufferGeometry;

  constructor(
    readonly capacity: number,
    readonly stride: number,
    base: { attribute: string; data: Float32Array; size: number; index: number[] },
    names: readonly string[],
    material: RawShaderMaterial,
    order: number,
  ) {
    this.data = new Float32Array(capacity * stride);
    this.buffer = new InstancedInterleavedBuffer(this.data, stride, 1);
    this.buffer.setUsage(DynamicDrawUsage);
    this.geometry = new InstancedBufferGeometry();
    this.geometry.setAttribute(base.attribute, new BufferAttribute(base.data, base.size));
    this.geometry.setIndex(base.index);
    names.forEach((name, k) =>
      this.geometry.setAttribute(name, new InterleavedBufferAttribute(this.buffer, 4, k * 4)),
    );
    this.geometry.instanceCount = 0;
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
  }

  set count(n: number) {
    this.geometry.instanceCount = Math.min(n, this.capacity);
  }

  get count(): number {
    return this.geometry.instanceCount;
  }

  /** Upload the first `n` instances (all of them by default). */
  upload(n = this.count): void {
    this.buffer.clearUpdateRanges();
    this.buffer.addUpdateRange(0, Math.max(1, n) * this.stride);
    this.buffer.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

function ribbon(): { data: Float32Array; index: number[] } {
  const data = new Float32Array((SEGMENTS + 1) * 4);
  const index: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    data.set([i / SEGMENTS, -1, i / SEGMENTS, 1], i * 4);
    if (i < SEGMENTS) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  return { data, index };
}

export class GLDrawing implements DrawingRenderer {
  readonly renderer: WebGLRenderer;
  readonly construction: InstanceLayer;
  readonly chains: InstanceLayer;
  readonly joints: InstanceLayer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly lineMaterial: RawShaderMaterial;
  private readonly chainMaterial: RawShaderMaterial;
  private readonly dotMaterial: RawShaderMaterial;
  private width = 1;
  private height = 1;
  dpr = 1;

  constructor(
    canvas: HTMLCanvasElement,
    sizes: { construction: number; chains: number; joints: number },
    palette: Palette,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      premultipliedAlpha: true,
      powerPreference: "default",
      preserveDrawingBuffer: false,
    });
    this.renderer.setClearColor(
      (palette.sheet[0] << 16) | (palette.sheet[1] << 8) | palette.sheet[2],
      1,
    );
    const shared = {
      uView: { value: [1, 1] },
      uDpr: { value: 1 },
      uCam: { value: [0, 0, 1] },
      uRot: { value: [1, 0] },
      uDepth: { value: [-1, 1] },
    };
    this.lineMaterial = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: LINE_VERTEX,
      fragmentShader: LINE_FRAGMENT,
      uniforms: {
        ...shared,
        uLoad: { value: palette.load.map((v) => v / 255) },
        uFade: { value: 1 },
      },
    });
    blendPremultiplied(this.lineMaterial);
    this.chainMaterial = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: LINE_VERTEX,
      fragmentShader: LINE_FRAGMENT,
      uniforms: {
        ...shared,
        uLoad: { value: palette.load.map((v) => v / 255) },
        uFade: { value: 1 },
      },
    });
    blendPremultiplied(this.chainMaterial);
    this.dotMaterial = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: DOT_VERTEX,
      fragmentShader: DOT_FRAGMENT,
      uniforms: { ...shared, uSheet: { value: palette.sheet.map((v) => v / 255) } },
    });
    blendPremultiplied(this.dotMaterial);

    const rib = ribbon();
    const names = ["iA", "iB", "iC", "iD"];
    const lineBase = { attribute: "aRib", data: rib.data, size: 2, index: rib.index };
    this.construction = new InstanceLayer(
      sizes.construction,
      RECORD,
      lineBase,
      names,
      this.lineMaterial,
      1,
    );
    this.chains = new InstanceLayer(sizes.chains, RECORD, lineBase, names, this.chainMaterial, 2);
    const quad = {
      attribute: "aCorner",
      data: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
      size: 2,
      index: [0, 1, 2, 0, 2, 3],
    };
    this.joints = new InstanceLayer(
      sizes.joints,
      DOT,
      quad,
      ["iP", "iC", "iK"],
      this.dotMaterial,
      3,
    );
    this.scene.add(this.construction.mesh, this.chains.mesh, this.joints.mesh);
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.width, this.height, false);
  }

  render(cam: Camera, depthRange: readonly [number, number], chainFade = 1): void {
    const c = Math.cos(cam.theta);
    const s = Math.sin(cam.theta);
    this.chainMaterial.uniforms.uFade!.value = chainFade;
    for (const material of [this.lineMaterial, this.chainMaterial, this.dotMaterial]) {
      const u = material.uniforms;
      u.uView!.value = [this.width, this.height];
      u.uDpr!.value = this.dpr;
      u.uCam!.value = [cam.ox, cam.gy, cam.s];
      u.uRot!.value = [c, s];
      u.uDepth!.value = [depthRange[0], depthRange[1]];
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.construction.dispose();
    this.chains.dispose();
    this.joints.dispose();
    this.lineMaterial.dispose();
    this.chainMaterial.dispose();
    this.dotMaterial.dispose();
    this.renderer.dispose();
  }
}

export const createGLDrawing: RendererFactory = (canvas, sizes, palette) =>
  new GLDrawing(canvas, sizes, palette);
