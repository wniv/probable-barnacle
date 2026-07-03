import type { Session } from "next-auth";

export function canAccessAgency(session: Session, agencyId: string): boolean {
  return session.user.role === "ADMIN" || session.user.agencyId === agencyId;
}

/** Admins can view any ad set, including soft-deleted ones. Agencies can only view their
 * own, and only if it hasn't been soft-deleted. */
export function canViewAdSet(
  session: Session,
  adSet: { agencyId: string; deletedAt: Date | null }
): boolean {
  if (session.user.role === "ADMIN") return true;
  return session.user.agencyId === adSet.agencyId && adSet.deletedAt === null;
}
