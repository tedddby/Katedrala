import { createId } from "../shared/id.js";
import { Column } from "./column.js";

export const BoardEvent = {
  CardAdded: "card-added",
  CardMoved: "card-moved",
  CardAssigned: "card-assigned",
} as const;

export type BoardEvent = (typeof BoardEvent)[keyof typeof BoardEvent];

export type BoardListener = (event: BoardEvent, cardId: string) => void;

export class Board {
  readonly id = createId("board");
  readonly columns: Column[] = [];
  private readonly listeners = new Set<BoardListener>();

  constructor(
    readonly name: string,
    readonly teamId: string,
  ) {}

  addColumn(name: string, wipLimit?: number): Column {
    if (this.findColumn(name) !== undefined) {
      throw new Error(`Board "${this.name}" already has a column named "${name}"`);
    }
    const column = new Column(name, (event, cardId) => this.emit(event, cardId), wipLimit);
    this.columns.push(column);
    return column;
  }

  findColumn(name: string): Column | undefined {
    return this.columns.find((column) => column.name === name);
  }

  findCard(cardId: string) {
    for (const column of this.columns) {
      const card = column.cards.find((candidate) => candidate.id === cardId);
      if (card !== undefined) {
        return card;
      }
    }
    return undefined;
  }

  moveCard(cardId: string, toColumnName: string): void {
    const target = this.findColumn(toColumnName);
    if (target === undefined) {
      throw new Error(`Column "${toColumnName}" does not exist on board "${this.name}"`);
    }
    const source = this.columns.find((column) => column.hasCard(cardId));
    if (source === undefined || source === target) {
      return;
    }
    target.accept(source.release(cardId));
  }

  subscribe(listener: BoardListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: BoardEvent, cardId: string): void {
    for (const listener of this.listeners) {
      listener(event, cardId);
    }
  }
}
