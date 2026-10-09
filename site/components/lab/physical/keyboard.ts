import { describeFile, type Model } from "./model";

/**
 * Keyboard access to the drawing, shared by the WebGL stage and the 2D fallback. Focusing the drawing from the
 * keyboard selects the foundation that carries the most; the arrows walk the files (left and right through a level,
 * up and down between levels), Home and End jump to the heaviest foundation and to the crown, Escape lets go.
 * Every selection is announced in words.
 */
export function attachKeyboard(
  root: HTMLElement,
  live: HTMLElement,
  model: Model,
  ends: { readonly crown: number; readonly heaviest: number },
  /** The file selected now (by the keyboard or the pointer), and how to select one (-1 lets go). */
  selected: () => number,
  select: (id: number) => void,
): () => void {
  const order = model.nodes
    .map((n) => n.id)
    .sort(
      (a, b) =>
        model.nodes[a]!.level - model.nodes[b]!.level ||
        model.nodes[b]!.reach - model.nodes[a]!.reach,
    );
  const choose = (id: number) => {
    select(id);
    live.textContent =
      id < 0 ? "" : `${model.nodes[id]!.path}. ${describeFile(model, id).join(", ")}.`;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const current = selected() >= 0 ? order.indexOf(selected()) : -1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = order[Math.min(order.length - 1, current + 1)]!;
    else if (event.key === "ArrowLeft") next = order[Math.max(0, current - 1)]!;
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const level = current >= 0 ? model.nodes[order[current]!]!.level : -1;
      const want = Math.min(
        Math.max(event.key === "ArrowUp" ? level + 1 : level - 1, 0),
        model.maxLevel,
      );
      next = order.find((id) => model.nodes[id]!.level === want) ?? null;
    } else if (event.key === "Home") next = ends.heaviest;
    else if (event.key === "End") next = ends.crown;
    else if (event.key === "Escape") next = -1;
    if (next === null) return;
    event.preventDefault();
    choose(next);
  };
  // Only a keyboard focus selects something; a click on the drawing is the pointer's business.
  const onFocus = () => {
    if (selected() < 0 && root.matches(":focus-visible")) choose(ends.heaviest);
  };
  const onBlur = () => {
    if (selected() >= 0) choose(-1);
  };
  root.addEventListener("keydown", onKeyDown);
  root.addEventListener("focus", onFocus);
  root.addEventListener("blur", onBlur);
  return () => {
    root.removeEventListener("keydown", onKeyDown);
    root.removeEventListener("focus", onFocus);
    root.removeEventListener("blur", onBlur);
  };
}
