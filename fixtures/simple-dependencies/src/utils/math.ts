export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Rounds half away from zero, avoiding the usual binary floating point surprises (1.005 -> 1.01). */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** clamp(Math.trunc(decimals), 0, 10);
  return (Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * factor)) / factor;
}
