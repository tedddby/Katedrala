import type { HTMLAttributes, ReactNode, Ref } from "react";
import { CropMarks } from "./CropMarks";

interface PlateProps extends HTMLAttributes<HTMLElement> {
  readonly ref?: Ref<HTMLElement>;
  /** The drawing's title block, a <TitleBlock />: over the sheet's bottom right corner, or below the drawing. */
  readonly titleBlock?: ReactNode;
  /** "figure" when the sheet carries a <figcaption> of its own; a plain block otherwise. */
  readonly as?: "div" | "figure";
}

/**
 * The sheet a drawing sits on: its content with an inner margin (--sheet-pad), four crop marks at its corners
 * where a bordered box would stand, and its title block. Every other attribute (id, role, aria-*, data-*,
 * handlers) goes to the sheet itself. Give role="img" to the drawing inside, never to the sheet: an image's
 * children are hidden from assistive technology, and the title block must be read. Code blocks and the terminal
 * keep their frames instead: they are tools.
 *
 * Bleeds are utilities on className, so they can change with the breakpoint: `bleed-x lg:bleed-none`,
 * `lg:bleed-right`. The sheet then runs to the window's edge on that side, and that side's marks are dropped.
 */
export function Plate({ ref, titleBlock, as = "div", className, children, ...rest }: PlateProps) {
  const Tag = as;
  return (
    <Tag
      {...rest}
      ref={ref as Ref<HTMLDivElement>}
      className={className === undefined ? "sheet" : `sheet ${className}`}
    >
      {children}
      <CropMarks />
      {titleBlock}
    </Tag>
  );
}
