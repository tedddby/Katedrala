import { createId } from "../shared/id.js";
import { Card, type CardListener } from "./card.js";

export class Column {
  readonly id = createId("column");
  readonly cards: Card[] = [];

  constructor(
    readonly name: string,
    private readonly notify: CardListener,
    readonly wipLimit?: number,
  ) {}

  get isFull(): boolean {
    return this.wipLimit !== undefined && this.cards.length >= this.wipLimit;
  }

  addCard(title: string): Card {
    this.assertCapacity();
    const card = new Card(title, this.notify);
    this.cards.push(card);
    card.markCreated();
    return card;
  }

  hasCard(cardId: string): boolean {
    return this.cards.some((card) => card.id === cardId);
  }

  release(cardId: string): Card {
    const index = this.cards.findIndex((card) => card.id === cardId);
    if (index === -1) {
      throw new Error(`Card ${cardId} is not in column "${this.name}"`);
    }
    const [card] = this.cards.splice(index, 1);
    return card;
  }

  accept(card: Card): void {
    this.assertCapacity();
    this.cards.push(card);
    card.markMoved();
  }

  cardsAssignedTo(memberId: string): Card[] {
    return this.cards.filter((card) => card.assignee === memberId);
  }

  private assertCapacity(): void {
    if (this.isFull) {
      throw new Error(`Column "${this.name}" reached its WIP limit of ${this.wipLimit}`);
    }
  }
}
