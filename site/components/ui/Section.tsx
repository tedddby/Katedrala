import type { ReactNode } from "react";

interface SectionProps {
  readonly id: string;
  readonly title: ReactNode;
  readonly lede?: ReactNode;
  /**
   * The section's status marks (one or more <Status /> elements), on their own line directly under the heading
   * and before the lede, so the status is read with the claim it qualifies.
   */
  readonly status?: ReactNode;
  /**
   * Content to the right of the heading on wide screens. Superseded by `status`; kept only until every section
   * has moved, then removed.
   */
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * A plate on the shared construction grid: a hairline rule, the heading, its status line and its one-sentence
 * lede, then the plate's own composition. Plates never carry an eyebrow; the heading speaks for itself.
 */
export function Section({ id, title, lede, status, aside, children, className }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`section ${className ?? ""}`}>
      <div className="frame">
        <div className="section-rule" />
        <header
          className={
            aside === undefined
              ? undefined
              : "flex flex-col gap-6 md:flex-row md:items-end md:justify-between"
          }
        >
          <div className="max-w-[46rem]">
            <h2 id={`${id}-title`} className="heading">
              {title}
            </h2>
            {status !== undefined && <div className="status-line">{status}</div>}
            {lede !== undefined && <p className="lede mt-5">{lede}</p>}
          </div>
          {aside !== undefined && <div className="shrink-0">{aside}</div>}
        </header>
        <div className="mt-12 md:mt-16">{children}</div>
      </div>
    </section>
  );
}
