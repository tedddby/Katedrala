import type { ReactNode } from "react";

interface SectionProps {
  readonly id: string;
  readonly title: ReactNode;
  readonly lede?: ReactNode;
  /** Content to the right of the heading on wide screens (a status mark, a control). */
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * A page section on the shared construction grid: a hairline rule, a heading with its one-sentence lede, then
 * the section's own composition. Sections never carry an eyebrow; the heading speaks for itself.
 */
export function Section({ id, title, lede, aside, children, className }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`section ${className ?? ""}`}>
      <div className="frame">
        <div className="section-rule" />
        <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[46rem]">
            <h2 id={`${id}-title`} className="heading">
              {title}
            </h2>
            {lede !== undefined && <p className="lede mt-5">{lede}</p>}
          </div>
          {aside !== undefined && <div className="shrink-0">{aside}</div>}
        </header>
        <div className="mt-12 md:mt-16">{children}</div>
      </div>
    </section>
  );
}
