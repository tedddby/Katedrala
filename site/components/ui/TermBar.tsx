/**
 * A measured share drawn as a bar along its track. The bar scales from the left (a transform, so changing the
 * value never triggers layout); a zero value keeps a hairline stub so the origin stays visible.
 */
export function TermBar({ value }: { value: number }) {
  const scale = Math.min(1, Math.max(value, 0.004));
  return (
    <span className="term-track" aria-hidden="true">
      <span className="term-bar" style={{ transform: `scaleX(${scale.toFixed(4)})` }} />
    </span>
  );
}
