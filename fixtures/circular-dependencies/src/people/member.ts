import { createId } from "../shared/id.js";
import { Team } from "./team.js";

export class Member {
  readonly id = createId("member");
  readonly email: string;

  constructor(
    email: string,
    readonly displayName: string,
    private team: Team,
  ) {
    this.email = email.trim().toLowerCase();
  }

  get teamName(): string {
    return this.team.name;
  }

  belongsTo(teamId: string): boolean {
    return this.team.id === teamId;
  }

  leaveTeam(): Team {
    this.team.remove(this.id);
    this.team = Team.personal(this);
    return this.team;
  }
}
