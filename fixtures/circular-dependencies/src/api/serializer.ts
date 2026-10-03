import type { Board } from "../workflow/board.js";
import type { ProjectDto, ProjectSummary } from "./project-dto.js";
import type { TaskDto, TaskStatus } from "./task-dto.js";

const DONE_COLUMNS = new Set(["done", "released", "closed"]);

export function statusOf(columnName: string, columnIndex: number): TaskStatus {
  if (DONE_COLUMNS.has(columnName.toLowerCase())) {
    return "done";
  }
  return columnIndex === 0 ? "todo" : "in-progress";
}

export function toProjectDto(board: Board): ProjectDto {
  const summary: ProjectSummary = { id: board.id, name: board.name, openTasks: 0 };
  const tasks: TaskDto[] = [];

  board.columns.forEach((column, index) => {
    const status = statusOf(column.name, index);
    for (const card of column.cards) {
      if (status !== "done") {
        summary.openTasks += 1;
      }
      tasks.push({
        id: card.id,
        title: card.title,
        status,
        column: column.name,
        assigneeId: card.assignee ?? null,
        labels: card.labels,
        project: summary,
      });
    }
  });

  return {
    id: board.id,
    name: board.name,
    teamId: board.teamId,
    columns: board.columns.map((column) => column.name),
    tasks,
  };
}
