import { createId } from "../shared/id.js";
import { BoardEvent } from "./board.js";

export type CardListener = (event: BoardEvent, cardId: string) => void;

export class Card {
  readonly id = createId("card");
  private assigneeId: string | undefined;
  private readonly tags = new Set<string>();

  constructor(
    readonly title: string,
    private readonly notify: CardListener,
  ) {}

  get assignee(): string | undefined {
    return this.assigneeId;
  }

  get labels(): string[] {
    return [...this.tags].sort();
  }

  label(name: string): this {
    this.tags.add(name.trim().toLowerCase());
    return this;
  }

  assign(memberId: string): void {
    if (this.assigneeId === memberId) {
      return;
    }
    this.assigneeId = memberId;
    this.notify(BoardEvent.CardAssigned, this.id);
  }

  markCreated(): void {
    this.notify(BoardEvent.CardAdded, this.id);
  }

  markMoved(): void {
    this.notify(BoardEvent.CardMoved, this.id);
  }
}
