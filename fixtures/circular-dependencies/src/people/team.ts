import { createId } from "../shared/id.js";
import { Member } from "./member.js";

export class Team {
  readonly id = createId("team");
  private readonly members = new Map<string, Member>();

  constructor(readonly name: string) {}

  /** The team a member ends up in after leaving their last shared team. */
  static personal(owner: Member): Team {
    const team = new Team(`${owner.displayName} (personal)`);
    team.add(owner);
    return team;
  }

  get size(): number {
    return this.members.size;
  }

  invite(email: string, displayName: string): Member {
    const existing = this.findByEmail(email);
    if (existing !== undefined) {
      return existing;
    }
    const member = new Member(email, displayName, this);
    this.add(member);
    return member;
  }

  add(member: Member): void {
    this.members.set(member.id, member);
  }

  remove(memberId: string): boolean {
    return this.members.delete(memberId);
  }

  findByEmail(email: string): Member | undefined {
    const normalized = email.trim().toLowerCase();
    return [...this.members.values()].find((member) => member.email === normalized);
  }
}
