import type { Member, MemberId } from "../model/member.js";

export interface MemberRepository {
  findById(id: MemberId): Promise<Member | null>;
}
