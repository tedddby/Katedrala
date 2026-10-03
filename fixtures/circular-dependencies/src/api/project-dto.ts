import type { TaskDto } from "./task-dto.js";

/** JSON representation of a board, as returned by `GET /projects/:id`. */
export interface ProjectDto {
  id: string;
  name: string;
  teamId: string;
  columns: string[];
  tasks: TaskDto[];
}

export type ProjectSummary = Pick<ProjectDto, "id" | "name"> & {
  openTasks: number;
};
