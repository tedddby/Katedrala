/**
 * Shaders for the stage. Positions live in a float texture written by the simulation (128 texels per row); chains
 * and weights fetch their particles from it, so a frame uploads one texture instead of rebuilding geometry.
 *
 * Lines are screen-space quads with their own 1px antialiasing: width in device pixels, in proportion to the square
 * root of the force they carry, thinner and fainter with depth. Chains take a hair-like sheen (Kajiya-Kay) from one
 * key light, so the light moves across them as the board turns. Weights are lit sphere impostors.
 */

const COMMON = /* glsl */ `
  precision highp float;
  precision highp int;
  precision highp sampler2D;
  ivec2 cell(float i) {
    int k = int(i + 0.5);
    return ivec2(k & 127, k >> 7);
  }
`;

/** Shared look: chalk lit by a key light, fog towards the sheet, load blue for what is active. */
const LOOK = /* glsl */ `
  uniform vec3 uLight;
  uniform float uFogNear;
  uniform float uFogFar;
  const vec3 CHALK = vec3(0.913, 0.902, 0.875);
  const vec3 BLUE = vec3(0.243, 0.651, 1.0);
  float fogOf(float depth) {
    return smoothstep(uFogNear, uFogFar, depth);
  }
`;

export const CHAIN_VERTEX = /* glsl */ `
  ${COMMON}
  ${LOOK}
  uniform sampler2D uPos;
  uniform sampler2D uForce;
  uniform sampler2D uForce0;
  uniform float uFixed;
  uniform float uLoadScale;
  uniform float uForceScale;
  uniform vec2 uViewport;
  uniform float uPixel;
  uniform float uRefDepth;
  uniform float uWMin;
  uniform float uWMax;
  uniform float uAMin;
  uniform float uAMax;
  uniform float uFront;
  uniform float uFrontWidth;
  uniform float uDim;
  uniform float uReveal;

  attribute float aA;
  attribute float aB;
  attribute float aSeg;
  attribute float aLevel;
  attribute float aHi;

  varying float vSide;
  varying float vHalf;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vec3 pa = texelFetch(uPos, cell(aA), 0).xyz;
    vec3 pb = texelFetch(uPos, cell(aB), 0).xyz;
    vec4 va = modelViewMatrix * vec4(pa, 1.0);
    vec4 vb = modelViewMatrix * vec4(pb, 1.0);
    vec4 ca = projectionMatrix * va;
    vec4 cb = projectionMatrix * vb;
    vec2 sa = ca.xy / ca.w * 0.5 * uViewport;
    vec2 sb = cb.xy / cb.w * 0.5 * uViewport;
    vec2 d = sb - sa;
    float len = length(d);
    vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);

    // Force: live while the model hangs; once the form is fixed, the photograph's tension, scaled by how much of
    // gravity still lies along the old direction (it passes through zero as the board passes the vertical).
    float live = max(texelFetch(uForce, cell(aSeg), 0).r, 0.0);
    float fixedForce = max(texelFetch(uForce0, cell(aSeg), 0).r, 0.0) * uLoadScale;
    float f = mix(live, fixedForce, uFixed);
    float t = sqrt(clamp(f * uForceScale, 0.0, 1.0));

    float depth = -mix(va.z, vb.z, position.x);
    float persp = clamp(uRefDepth / max(depth, 1e-3), 0.7, 1.35);
    float w = (uWMin + uWMax * t) * persp * uPixel;
    float a = uAMin + (uAMax - uAMin) * t;
    float fog = fogOf(depth);

    // Sheen: brightest where the chain runs across the light.
    vec3 T = normalize(vb.xyz - va.xyz + vec3(1e-5));
    float tl = dot(T, uLight);
    float diffuse = sqrt(max(0.0, 1.0 - tl * tl));
    vec3 H = normalize(uLight + vec3(0.0, 0.0, 1.0));
    float th = dot(T, H);
    float spec = pow(sqrt(max(0.0, 1.0 - th * th)), 28.0);
    vec3 color = CHALK * (0.58 + 0.42 * diffuse) + vec3(spec * 0.22);

    // The turn-over: a front of load blue runs through the levels as the forces reverse.
    float flash = exp(-pow((aLevel - uFront) / uFrontWidth, 2.0));
    // Highlight: 1 on the load path down to the ground, 0.5 on the load the member carries.
    float hi = step(0.25, aHi);
    float strong = step(0.75, aHi);
    color = mix(color, BLUE, max(flash * 0.9, hi));
    a = max(a, flash * 0.75);
    if (strong > 0.5) {
      a = max(a, 0.92);
      w = max(w, 1.7 * uPixel);
    } else if (hi > 0.5) {
      a = max(a * 0.85, 0.4);
    }
    a *= mix(1.0, 0.16, uDim * (1.0 - hi));
    a *= 1.0 - 0.62 * fog * (1.0 - hi);
    a *= uReveal;

    // Sub-pixel lines fade rather than thin, so they never shimmer.
    if (w < 1.0) {
      a *= w;
      w = 1.0;
    }
    float halfW = w * 0.5;
    vec4 c = position.x < 0.5 ? ca : cb;
    c.xy += nrm * (halfW + 1.0) * position.y / (0.5 * uViewport) * c.w;
    gl_Position = c;
    vSide = position.y * (halfW + 1.0);
    vHalf = halfW;
    vAlpha = a;
    vColor = color;
  }
`;

export const LINE_FRAGMENT = /* glsl */ `
  precision highp float;
  varying float vSide;
  varying float vHalf;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float coverage = clamp(vHalf + 0.5 - abs(vSide), 0.0, 1.0);
    float a = vAlpha * coverage;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

/** Static lines on the board (plan, footings, hatching, level scale): endpoints in the board's frame. */
export const BOARD_VERTEX = /* glsl */ `
  ${COMMON}
  ${LOOK}
  uniform vec2 uViewport;
  uniform float uPixel;
  uniform float uReveal;
  uniform float uDim;

  attribute vec3 aP0;
  attribute vec3 aP1;
  attribute float aWidth;
  attribute float aAlpha;
  attribute float aTone;

  varying float vSide;
  varying float vHalf;
  varying float vAlpha;
  varying vec3 vColor;

  const vec3 GRAPHITE = vec3(0.365, 0.380, 0.400);

  void main() {
    vec4 va = modelViewMatrix * vec4(aP0, 1.0);
    vec4 vb = modelViewMatrix * vec4(aP1, 1.0);
    vec4 ca = projectionMatrix * va;
    vec4 cb = projectionMatrix * vb;
    vec2 sa = ca.xy / ca.w * 0.5 * uViewport;
    vec2 sb = cb.xy / cb.w * 0.5 * uViewport;
    vec2 d = sb - sa;
    float len = length(d);
    vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float w = aWidth * uPixel;
    float a = aAlpha;
    float depth = -mix(va.z, vb.z, position.x);
    a *= 1.0 - 0.45 * fogOf(depth);
    a *= mix(1.0, 0.55, uDim);
    a *= uReveal;
    if (w < 1.0) {
      a *= w;
      w = 1.0;
    }
    float halfW = w * 0.5;
    vec4 c = position.x < 0.5 ? ca : cb;
    c.xy += nrm * (halfW + 1.0) * position.y / (0.5 * uViewport) * c.w;
    gl_Position = c;
    vSide = position.y * (halfW + 1.0);
    vHalf = halfW;
    vAlpha = a;
    vColor = mix(GRAPHITE, CHALK, aTone);
  }
`;

export const WEIGHT_VERTEX = /* glsl */ `
  ${COMMON}
  ${LOOK}
  uniform sampler2D uPos;
  uniform float uPxPerUnit;
  uniform float uPixel;
  uniform float uDim;
  uniform float uReveal;

  attribute float aIndex;
  attribute float aRadius;
  attribute float aKind;
  attribute float aHi;

  varying vec2 vUv;
  varying float vEdge;
  varying float vAlpha;
  varying float vHi;
  varying float vKind;
  varying float vFog;

  void main() {
    vec3 p = texelFetch(uPos, cell(aIndex), 0).xyz;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float depth = -mv.z;
    float rPx = aRadius * uPxPerUnit / max(depth, 1e-3) * uPixel;
    // Never smaller than a legible dot.
    float minPx = (aKind > 0.5 && aKind < 1.5 ? 2.2 : 1.7) * uPixel;
    float scale = max(1.0, minPx / max(rPx, 1e-4));
    float r = aRadius * scale;
    float px = rPx * scale;
    float pad = 1.0 + 1.5 / max(px, 1.0);
    mv.xy += position.xy * r * pad;
    gl_Position = projectionMatrix * mv;
    vUv = position.xy * pad;
    vEdge = 1.0 / max(px, 1.0);
    vFog = fogOf(depth);
    // Dimmed when another member is active, unless it is on that member's load path (fainter on the load it carries).
    float a = (aHi > 0.75 ? 1.0 : aHi > 0.25 ? 0.62 : mix(1.0, 0.22, uDim)) * uReveal;
    vAlpha = a;
    vHi = aHi;
    vKind = aKind;
  }
`;

export const WEIGHT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uLight;
  const vec3 CHALK = vec3(0.913, 0.902, 0.875);
  const vec3 BLUE = vec3(0.243, 0.651, 1.0);
  const vec3 SHEET = vec3(0.055, 0.063, 0.071);
  varying vec2 vUv;
  varying float vEdge;
  varying float vAlpha;
  varying float vHi;
  varying float vKind;
  varying float vFog;
  void main() {
    float r = length(vUv);
    float coverage = clamp((1.0 - r) / (vEdge * 1.5) + 0.5, 0.0, 1.0);
    if (coverage <= 0.0) discard;
    vec3 base = mix(CHALK, BLUE, step(0.5, vHi));
    vec3 color;
    if (vHi > 1.5) {
      // The selected file: a ring of load blue around a sheet-coloured core.
      float ring = smoothstep(0.58 - vEdge, 0.58 + vEdge, r);
      color = mix(SHEET, BLUE, ring);
    } else {
      vec3 n = vec3(vUv, sqrt(max(0.0, 1.0 - r * r)));
      float lambert = max(dot(n, uLight), 0.0);
      vec3 h = normalize(uLight + vec3(0.0, 0.0, 1.0));
      float spec = pow(max(dot(n, h), 0.0), 36.0);
      color = base * (0.34 + 0.72 * lambert) + vec3(spec * 0.35);
      // Entry points (kind 2) carry a dark core: the open tops of the structure.
      if (vKind > 1.5) color = mix(color, SHEET, 1.0 - smoothstep(0.34 - vEdge, 0.34 + vEdge, r));
    }
    color = mix(color, SHEET, vFog * 0.55 * (1.0 - min(vHi, 1.0)));
    gl_FragColor = vec4(color, vAlpha * coverage);
  }
`;

/**
 * The board's surface: the plan is drawn on a board, not in the air. A dark plane lit by the key light on the side
 * the camera sees: an unlit underside while the model hangs from it, a dimly lit ground once it stands on it.
 */
export const PLANE_VERTEX = /* glsl */ `
  ${COMMON}
  ${LOOK}
  attribute float aR;
  varying float vR;
  varying float vTop;
  varying float vBottom;
  varying float vFog;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vec3 n = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
    vTop = max(dot(n, uLight), 0.0);
    vBottom = max(dot(-n, uLight), 0.0);
    vR = aR;
    vFog = fogOf(-mv.z);
  }
`;

export const PLANE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uReveal;
  uniform float uDim;
  varying float vR;
  varying float vTop;
  varying float vBottom;
  varying float vFog;
  const vec3 SHEET = vec3(0.055, 0.063, 0.071);
  const vec3 LIT = vec3(0.118, 0.133, 0.149);
  void main() {
    float lit = gl_FrontFacing ? vTop : vBottom;
    vec3 color = mix(SHEET, LIT, 0.2 + 0.8 * lit);
    float a = (1.0 - smoothstep(0.86, 1.0, vR)) * uReveal * mix(1.0, 0.7, uDim) * (1.0 - 0.4 * vFog);
    gl_FragColor = vec4(color, a);
  }
`;
