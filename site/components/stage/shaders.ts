/**
 * GLSL for the stage (GLSL ES 3.0 through three.js ShaderMaterial). Everything is drawn like ink on the sheet:
 * line widths in screen pixels with analytic anti-aliasing, so no MSAA is needed. File positions come from a
 * float texture the simulation writes every frame; chains, catenaries and slack are computed here, per vertex.
 */

const NODE = /* glsl */ `
uniform highp sampler2D uPos;
vec4 node(float i) {
  int k = int(i + 0.5);
  return texelFetch(uPos, ivec2(k % 32, k / 32), 0);
}
`;

export const CHAIN_VERT = /* glsl */ `
${NODE}
uniform vec2 uViewport;
uniform float uPx;
uniform float uWidth;
uniform float uRefDist;
uniform float uFocus;
uniform float uDim;
uniform float uLitPass;
uniform float uWave;
uniform float uFadeNear;
uniform float uFadeFar;
uniform float uFadeAmount;
uniform float uAlpha;
uniform float uEmphasis;

in float aT;
in float aSide;
in vec2 iEnds;
in vec4 iInfo;   // sag, rest length, ink (0..1, from the load it carries), lit
in vec2 iLevels; // level of the hanging end, level of the support

out float vSide;
out float vHalf;
out float vAlpha;
out float vBlue;

vec3 chainAt(vec3 a, vec3 b, float sag, float t) {
  vec3 p = mix(b, a, t);
  p.y -= sag * 4.0 * t * (1.0 - t);
  return p;
}

void main() {
  vec4 A = node(iEnds.x);
  vec4 B = node(iEnds.y);
  float lit = iInfo.w;
  float shown = min(A.w, B.w);
  if (shown < 0.002 || (uLitPass > 0.5 && lit < 0.5)) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  // A chain longer than the gap between its ends is slack and droops; taut, it keeps its own small sag.
  float d = distance(A.xyz, B.xyz);
  float len = iInfo.y;
  float slack = 0.5 * sqrt(max(0.0, len * len - d * d));
  float sag = max(iInfo.x, slack);

  vec3 P = chainAt(A.xyz, B.xyz, sag, aT);
  vec4 mvP = modelViewMatrix * vec4(P, 1.0);
  vec4 cP = projectionMatrix * mvP;
  float dist = -mvP.z;

  // The screen tangent, analytically: d(clip.xy / clip.w) / dt, up to the positive factor 1 / w^2. It always
  // points from the support to the hanging end, so the ribbon keeps one winding (counter-clockwise, front-facing).
  vec3 T = (A.xyz - B.xyz) - vec3(0.0, sag * 4.0 * (1.0 - 2.0 * aT), 0.0);
  vec4 cT = projectionMatrix * (modelViewMatrix * vec4(T, 0.0));
  vec2 dir = (cT.xy * cP.w - cP.xy * cT.w) * uViewport;
  dir = dir / max(length(dir), 1e-12);
  vec2 nrm = vec2(-dir.y, dir.x);

  float ink = iInfo.z;
  float w = mix(0.55, uWidth, ink) * clamp(uRefDist / max(dist, 0.5), 0.7, 2.4);
  w *= 1.0 + 0.2 * lit * uFocus;
  float halfPx = 0.5 * w * uPx;
  float quad = max(halfPx, 0.5 * uPx) + uPx;
  cP.xy += nrm * aSide * quad * 2.0 / uViewport * cP.w;
  gl_Position = cP;

  vSide = aSide * quad;
  vHalf = halfPx;
  float fade = 1.0 - uFadeAmount * smoothstep(uFadeNear, uFadeFar, dist);
  float a = mix(0.075, 0.92, ink) * fade * shown * uAlpha;
  a *= 1.0 - uDim * uFocus * (1.0 - lit);
  a = mix(a, max(a, mix(0.5, 0.95, ink)), lit * uFocus);
  // An act's emphasis: every chain brightens in chalk for a moment, lit or not.
  a = max(a, uEmphasis * mix(0.34, 0.9, ink) * fade * shown);
  // Too close to the lens: let it go rather than smear across the frame.
  a *= smoothstep(0.6, 2.2, cP.w);
  vAlpha = a;
  // The load wave: where its front passes, the members carry the load colour.
  float lv = mix(iLevels.y, iLevels.x, aT);
  float wx = (lv - uWave) / 1.15;
  float wave = exp(-wx * wx);
  vBlue = max(lit * uFocus, wave);
  vAlpha = max(vAlpha, wave * 0.75 * shown * fade);
}
`;

export const CHAIN_FRAG = /* glsl */ `
layout(location = 0) out highp vec4 outColor;
uniform vec3 uChalk;
uniform vec3 uBlue;
uniform float uFlash;
uniform float uPx;
in float vSide;
in float vHalf;
in float vAlpha;
in float vBlue;
void main() {
  float h = max(vHalf, 0.5 * uPx);
  float cover = clamp((h + 0.5 * uPx - abs(vSide)) / uPx, 0.0, 1.0);
  float thin = clamp(vHalf / (0.5 * uPx), 0.0, 1.0);
  float a = vAlpha * cover * mix(thin, 1.0, 0.25);
  if (a < 0.002) discard;
  vec3 col = mix(uChalk, uBlue, max(vBlue, uFlash));
  outColor = vec4(col, a);
}
`;

export const JOINT_VERT = /* glsl */ `
${NODE}
uniform vec2 uViewport;
uniform float uPx;
uniform float uFocus;
uniform float uDim;
uniform float uFadeNear;
uniform float uFadeFar;
uniform float uFadeAmount;
uniform float uAlpha;

in vec2 aCorner;
in vec4 iInfo; // index, radius (model units), kind (0 file, 1 foundation, 2 on the board alone), lit

out vec2 vLocal;
out float vR;
out float vAlpha;
out float vKind;
out float vLit;

void main() {
  vec4 N = node(iInfo.x);
  if (N.w < 0.002) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vec4 mv = modelViewMatrix * vec4(N.xyz, 1.0);
  vec4 c = projectionMatrix * mv;
  float dist = max(-mv.z, 0.5);
  float pxPerUnit = projectionMatrix[1][1] * uViewport.y * 0.5 / dist;
  // Appearing: the ring opens from most of its size, never from nothing.
  float r = max(iInfo.y * pxPerUnit, 1.7 * uPx) * mix(0.72, 1.0, N.w);
  float q = r + 1.6 * uPx;
  c.xy += aCorner * q * 2.0 / uViewport * c.w;
  gl_Position = c;
  vLocal = aCorner * q;
  vR = r;
  vKind = iInfo.z;
  vLit = iInfo.w * uFocus;
  float fade = 1.0 - 0.9 * uFadeAmount * smoothstep(uFadeNear, uFadeFar, dist);
  float a = N.w * fade * uAlpha;
  a *= 1.0 - uDim * 0.9 * uFocus * (1.0 - iInfo.w);
  a *= smoothstep(0.6, 2.2, c.w);
  vAlpha = a;
}
`;

export const JOINT_FRAG = /* glsl */ `
layout(location = 0) out highp vec4 outColor;
uniform vec3 uChalk;
uniform vec3 uBlue;
uniform vec3 uSheet;
uniform float uFlash;
uniform float uPx;
in vec2 vLocal;
in float vR;
in float vAlpha;
in float vKind;
in float vLit;
void main() {
  float d = length(vLocal);
  float stroke = mix(1.1, 1.5, smoothstep(4.0, 14.0, vR / uPx)) * uPx;
  float ring = clamp((stroke * 0.5 + 0.5 * uPx - abs(d - vR)) / uPx, 0.0, 1.0);
  float inside = clamp((vR - d) / uPx + 0.5, 0.0, 1.0);
  vec3 ink = mix(uChalk, uBlue, max(vLit, uFlash * 0.85));
  // Files are rings filled with the sheet (they hide the chains behind them); foundations are solid.
  vec3 fill = vKind > 0.5 && vKind < 1.5 ? ink : mix(uSheet, uBlue, vLit * 0.35);
  float cover = max(ring, inside);
  if (cover * vAlpha < 0.003) discard;
  vec3 col = mix(fill, ink, ring);
  outColor = vec4(col, cover * vAlpha);
}
`;

export const BOARD_VERT = /* glsl */ `
out vec3 vModel;
out vec3 vWorld;
void main() {
  vModel = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const BOARD_FRAG = /* glsl */ `
layout(location = 0) out highp vec4 outColor;
uniform vec2 uAxes;     // plan semi-axes
uniform vec3 uNormal;   // board normal in world space
uniform vec3 uGraphite;
uniform vec3 uChalk;
uniform float uOpacity;
uniform float uPx;
uniform float uDraw;    // 0..1: how far round the plan the pen has gone
uniform float uStart;   // where the pen starts, radians
in vec3 vModel;
in vec3 vWorld;

float hairline(float x, float fw, float halfWidthPx) {
  return 1.0 - smoothstep(fw * (halfWidthPx - 0.5), fw * (halfWidthPx + 0.5), abs(x));
}

void main() {
  vec2 e = vec2(vModel.x / uAxes.x, vModel.z / uAxes.y);
  float r = length(e);
  float q = fract((atan(e.y, e.x) - uStart) / 6.2831853);
  float drawn = 1.0 - smoothstep(uDraw - 0.004, uDraw, q);
  if (drawn < 0.002) discard;
  // The band the foundations stand in, hatched like a fixed support, with its two edges drawn.
  float u = (vModel.x - vModel.z) / 0.3;
  float fu = max(fwidth(u), 1e-4);
  float dl = abs(fract(u + 0.5) - 0.5);
  float hatch = 1.0 - smoothstep(fu * 0.1, fu * 0.9, dl);
  hatch *= 1.0 - smoothstep(0.22, 0.45, fu); // too dense to read at a grazing angle: let it go
  float band = smoothstep(0.84, 0.87, r) * (1.0 - smoothstep(1.13, 1.16, r));
  float fr = max(fwidth(r), 1e-4);
  float edges = max(hairline(r - 0.865, fr, 0.55 * uPx), hairline(r - 1.145, fr, 0.55 * uPx));
  vec3 view = normalize(cameraPosition - vWorld);
  float graze = smoothstep(0.03, 0.22, abs(dot(view, uNormal)));
  // The pen: the last stretch it drew is still wet, a little brighter.
  float tip = uDraw < 1.0 ? exp(-(uDraw - q) * 60.0) : 0.0;
  float a = (hatch * band * 0.5 * graze + edges * mix(0.5, 0.75, graze) * (1.0 + tip)) * drawn * uOpacity;
  if (a < 0.003) discard;
  outColor = vec4(mix(uGraphite, uChalk, min(1.0, edges * (0.35 + tip))), min(a, 1.0));
}
`;

/**
 * The board's thickness: an elliptical wall standing on the outer edge of the band, hatched like a section.
 * Hanging, it is the board the model hangs from; turned over, it is the ground under the foundations.
 */
export const WALL_VERT = /* glsl */ `
in float aS; // arc length round the plan, model units
in float aQ; // 0..1 round the plan, in the pen's order
in float aH; // 0 at the plan, 1 at the far face of the board
out float vS;
out float vQ;
out float vH;
void main() {
  vS = aS;
  vQ = aQ;
  vH = aH;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const WALL_FRAG = /* glsl */ `
layout(location = 0) out highp vec4 outColor;
uniform vec3 uGraphite;
uniform vec3 uChalk;
uniform float uDraw;
uniform float uSlab;
uniform float uPx;
uniform float uOpacity;
in float vS;
in float vQ;
in float vH;
void main() {
  float drawn = 1.0 - smoothstep(uDraw - 0.004, uDraw, vQ);
  if (drawn < 0.002) discard;
  float u = (vS + vH * uSlab) / 0.3;
  float fu = max(fwidth(u), 1e-4);
  float dl = abs(fract(u + 0.5) - 0.5);
  float hatch = (1.0 - smoothstep(fu * 0.1, fu * 0.9, dl)) * (1.0 - smoothstep(0.25, 0.5, fu));
  float fh = max(fwidth(vH), 1e-4);
  float edge = 1.0 - smoothstep(fh * 0.4 * uPx, fh * 1.4 * uPx, 1.0 - vH);
  // The far side of the wall shows through, fainter, like a hidden line.
  float side = gl_FrontFacing ? 1.0 : 0.42;
  float a = (hatch * 0.36 + edge * 0.6) * side * drawn * uOpacity;
  if (a < 0.003) discard;
  outColor = vec4(mix(uGraphite, uChalk, edge * 0.3), a);
}
`;
