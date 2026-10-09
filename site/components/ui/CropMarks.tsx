/**
 * The film's photograph, reused: four crop marks (12 px arms, 1 px, the faintest ink) at the corners of the
 * nearest positioned ancestor. They stand where a box would, around real content only, never as decoration
 * around nothing. A side that bleeds to the window's edge (bleed-left, bleed-right, bleed-x) drops its two marks.
 * <Plate> draws them itself; use this alone on a positioned element that cannot be a <Plate>.
 */
export function CropMarks() {
  return (
    <span className="crop-marks" aria-hidden="true">
      <span data-corner="top-start" />
      <span data-corner="top-end" />
      <span data-corner="bottom-end" />
      <span data-corner="bottom-start" />
    </span>
  );
}
