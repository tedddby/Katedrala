import { Team } from "../people/team.js";
import { Board } from "../workflow/board.js";

export function seedDemoBoard(): Board {
  const team = new Team("Platform");
  const ada = team.invite("ada@example.com", "Ada");
  const linus = team.invite("linus@example.com", "Linus");

  const board = new Board("Sprint 42", team.id);
  const todo = board.addColumn("To do");
  board.addColumn("In progress", 3);
  board.addColumn("Done");

  todo.addCard("Upgrade TypeScript").label("chore").assign(ada.id);
  todo.addCard("Document the release process").label("docs");

  const flaky = todo.addCard("Fix flaky checkout test").label("bug");
  flaky.assign(linus.id);
  board.moveCard(flaky.id, "In progress");

  return board;
}
