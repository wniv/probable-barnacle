import type { Session } from "next-auth";

export function canAccessAgency(session: Session, agencyId: string): boolean {
  return session.user.role === "ADMIN" || session.user.agencyId === agencyId;
}
