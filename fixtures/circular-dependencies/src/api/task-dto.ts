import type { ProjectSummary } from "./project-dto.js";

export type TaskStatus = "todo" | "in-progress" | "done";

/** JSON representation of a card, embedded in a project or returned by `GET /tasks/:id`. */
export interface TaskDto {
  id: string;
  title: string;
  status: TaskStatus;
  column: string;
  assigneeId: string | null;
  labels: string[];
  project: ProjectSummary;
}
