import { type Member } from "../people/member.js";
import { BoardEvent } from "../workflow/board.js";

export interface DigestEntry {
  event: BoardEvent;
  cardTitle: string;
  at: Date;
}

export function describe(entry: DigestEntry): string {
  switch (entry.event) {
    case BoardEvent.CardAdded:
      return `"${entry.cardTitle}" was added`;
    case BoardEvent.CardMoved:
      return `"${entry.cardTitle}" moved to another column`;
    case BoardEvent.CardAssigned:
      return `"${entry.cardTitle}" was assigned`;
  }
}

export function buildDigest(entries: DigestEntry[], recipient: Member): string {
  if (entries.length === 0) {
    return `Hi ${recipient.displayName}, nothing changed on ${recipient.teamName}'s boards today.`;
  }
  const lines = [...entries]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((entry) => `- ${describe(entry)}`);
  return [`Hi ${recipient.displayName}, here is what happened today:`, ...lines].join("\n");
}
