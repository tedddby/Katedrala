# circular-dependencies

`@kanban/board-core`, the domain model of a kanban tool: boards with columns and cards, teams with members,
and the JSON shapes the API returns. The code is the kind of library where cycles creep in naturally: entities
that hold each other, and DTO interfaces that reference each other. It uses NodeNext ESM resolution, so every
relative specifier ends in `.js` and must be mapped to the `.ts` source.

## The cycles

| Cycle                     | Files                                                               | Edges                                                                                   | Kind          |
| ------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------- |
| 3-file runtime cycle      | `src/workflow/board.ts`, `src/workflow/column.ts`, `src/workflow/card.ts` | board -> column (`new Column`), column -> card (`new Card`), card -> board (`BoardEvent.*` constants) | all `static`  |
| 2-file runtime cycle      | `src/people/team.ts`, `src/people/member.ts`                        | team -> member (`new Member`), member -> team (`Team.personal(...)`)                   | all `static`  |
| 2-file type-only cycle    | `src/api/project-dto.ts`, `src/api/task-dto.ts`                     | project-dto -> task-dto, task-dto -> project-dto                                         | all `import type` |

Each cycle contains exactly the edges listed: there is no additional edge between members of the same cycle.

## Acyclic files around the cycles

- `src/shared/id.ts`: leaf imported by the five entity files (board, column, card, team, member); imports
  `node:crypto`.
- `src/api/serializer.ts`: depends (type-only) on the board and on both DTO files; nothing depends on it except
  the barrel.
- `src/notifications/digest.ts`: `import { type Member }` (all bindings type-only, classified `type`) and a
  value import of `BoardEvent`.
- `src/demo/seed.ts`: constructs a board and a team; loaded lazily by `src/index.ts` with `import()`.
- `src/index.ts`: the package barrel: five `export ... from` re-exports, one `import type`, one dynamic import.

## Expected conclusions

- 14 files (12 TypeScript sources, `package.json`, `tsconfig.json`); 26 import statements resolve to fixture
  files; the only external is `node:crypto`; nothing is unresolved.
- Exactly three file-level strongly connected components with more than one file (over all import kinds):
  `{board, card, column}`, `{member, team}`, `{project-dto, task-dto}`.
- `{project-dto, task-dto}` is a **type-only cycle**: every edge inside it is erased at runtime, so it
  disappears when type-only imports are excluded. Katedrala should identify it as type-only (it has no
  runtime effect), distinct from the two runtime cycles, which remain when type-only imports are excluded.
- No file outside the three cycles is part of a cycle; `src/index.ts`, `src/demo/seed.ts`,
  `src/api/serializer.ts` and `src/notifications/digest.ts` depend on cycle members without closing a loop.
