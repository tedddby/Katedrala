import { Member, type MemberId, type MemberRepository, type MembershipTier } from "../../domain/index.js";
import type { SqlPool } from "./pool.js";

type MemberRow = {
  id: string;
  name: string;
  email: string;
  tier: MembershipTier;
};

export class SqlMemberRepository implements MemberRepository {
  constructor(private readonly pool: SqlPool) {}

  async findById(id: MemberId): Promise<Member | null> {
    const result = await this.pool.query<MemberRow>("SELECT id, name, email, tier FROM members WHERE id = $1", [id]);
    const row = result.rows[0];
    return row === undefined ? null : new Member(row.id, row.name, row.email, row.tier);
  }
}
