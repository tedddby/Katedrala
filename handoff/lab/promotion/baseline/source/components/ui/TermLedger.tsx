import type { ReactNode } from "react";
import { formatScore } from "@/lib/demo/metrics";

/**
 * One weighted term of a score laid on its load line, as in a force polygon: a vector from `from` to `to` on the
 * score's 0 to 1 scale. Consecutive terms are laid head to tail, each starting where the previous one ends, so
 * the resultant (the score) spans them all. Positions are transforms, so changing the values never triggers
 * layout; a term of zero keeps its tail mark so the chain stays readable.
 */
export function TermVector({
  from,
  to,
  resultant = false,
}: {
  from: number;
  to: number;
  resultant?: boolean;
}) {
  const start = Math.min(1, Math.max(0, from));
  const end = Math.min(1, Math.max(start, to));
  const position = (x: number) => `translateX(${(x * 100).toFixed(3)}%)`;
  return (
    <span
      className="term-vector"
      data-resultant={resultant}
      data-empty={end - start < 0.004}
      aria-hidden="true"
    >
      <span
        className="term-vector-shaft"
        style={{ transform: `${position(start)} scaleX(${(end - start).toFixed(4)})` }}
      />
      <span className="term-vector-mark" style={{ transform: position(start) }}>
        <span className="term-vector-tail" />
      </span>
      <span className="term-vector-mark" style={{ transform: position(end) }}>
        <svg viewBox="0 0 8 8" className="term-vector-head">
          <path d="M0.5 1 7 4 0.5 7" />
        </svg>
      </span>
    </span>
  );
}

/** Where each term starts and ends when the terms are laid head to tail. */
export function chain(values: readonly number[]): { from: number; to: number }[] {
  let at = 0;
  return values.map((value) => {
    const from = at;
    at += value;
    return { from, to: at };
  });
}

/**
 * A score as a ledger: one row per weighted term, then the sum that closes the load line. The column head says
 * what the two factors of a row are; screen readers hear the same arithmetic in words on every row.
 */
export function TermLedger({
  children,
  score,
  className,
}: {
  /** The rows: TermRow elements. */
  children: ReactNode;
  score: number;
  className?: string;
}) {
  return (
    <div className={`ledger ${className ?? ""}`}>
      <p className="ledger-head" aria-hidden="true">
        <span>normalized × weight</span>
      </p>
      <ol className="ledger-terms">{children}</ol>
      <div className="ledger-sum">
        <span className="term-label">Sum</span>
        <span className="term-value data">{formatScore(score)}</span>
        <TermVector from={0} to={score} resultant />
      </div>
    </div>
  );
}

/**
 * One term of a ledger, as arithmetic a reader can redo: what was measured, its normalized value times its
 * weight, equal to the contribution it adds (as formatParts rounds it, so the column adds up to the score), and
 * its vector on the load line.
 */
export function TermRow({
  label,
  measured,
  normalized,
  weight,
  value,
  from,
  to,
  children,
}: {
  label: ReactNode;
  /** The raw measurement, set after the label; an arrow then leads it to its normalized value. */
  measured?: ReactNode;
  normalized: number;
  weight: number;
  /** The contribution as shown. */
  value: string;
  from: number;
  to: number;
  /** Evidence printed under the vector. */
  children?: ReactNode;
}) {
  return (
    <li className="term" data-measured={measured !== undefined ? "" : undefined}>
      <span className="term-label">
        {label}
        {measured !== undefined && (
          <>
            {" "}
            <span className="whitespace-nowrap text-ink-faint">{measured}</span>
          </>
        )}
      </span>
      <span className="term-product data">
        {measured !== undefined && <span aria-hidden="true">→ </span>}
        <span className="sr-only">: normalized </span>
        {formatScore(normalized)} ×<span className="sr-only"> weight</span> {weight.toFixed(2)}
      </span>
      <span className="term-value data">
        <span className="text-ink-faint">= </span>
        {value}
      </span>
      <TermVector from={from} to={to} />
      {children}
    </li>
  );
}
