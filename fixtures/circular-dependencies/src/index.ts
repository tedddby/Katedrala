import type { Board } from "./workflow/board.js";

export { Board, BoardEvent } from "./workflow/board.js";
export { Member } from "./people/member.js";
export { Team } from "./people/team.js";
export { toProjectDto } from "./api/serializer.js";
export { buildDigest } from "./notifications/digest.js";

/** Builds a populated board for demos and screenshots. The seed data is only loaded when needed. */
export async function createDemoBoard(): Promise<Board> {
  const { seedDemoBoard } = await import("./demo/seed.js");
  return seedDemoBoard();
}
