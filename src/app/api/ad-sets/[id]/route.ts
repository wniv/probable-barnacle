import { auth } from "@/auth";
import { canViewAdSet } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { kickProcessing, TERMINAL_STATUSES } from "@/lib/processing";
import { deleteVideo } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const adSet = await prisma.adSet.findUnique({
    where: { id },
    include: { ads: { include: { issues: true } } },
  });
  if (!adSet || !canViewAdSet(session, adSet)) {
    return Response.json({ error: "Ad set not found" }, { status: 404 });
  }
  return Response.json({ adSet });
}

/**
 * Idempotent "resume" hook the client poller pings while a set is still processing. If any ad
 * isn't in a terminal state and nothing is actively working it (e.g. after an instance restart),
 * this re-kicks the background driver. Safe to call repeatedly — kickProcessing dedupes.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const adSet = await prisma.adSet.findUnique({
    where: { id },
    include: { ads: { select: { status: true } } },
  });
  if (!adSet || !canViewAdSet(session, adSet)) {
    return Response.json({ error: "Ad set not found" }, { status: 404 });
  }

  const hasPending = adSet.ads.some((ad) => !TERMINAL_STATUSES.includes(ad.status));
  if (hasPending) {
    kickProcessing(id);
  }
  return Response.json({ processing: hasPending });
}

/**
 * Agencies "delete" their own ad set — it's soft-deleted (hidden from their view) but stays
 * fully visible to admins. Admins permanently delete, cascading to Ads/Issues and cleaning up
 * the underlying video files in Object Storage.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const adSet = await prisma.adSet.findUnique({ where: { id }, include: { ads: true } });
  if (!adSet || !canViewAdSet(session, adSet)) {
    return Response.json({ error: "Ad set not found" }, { status: 404 });
  }

  if (session.user.role === "ADMIN") {
    await prisma.adSet.delete({ where: { id } });
    await Promise.all(adSet.ads.map((ad) => deleteVideo(ad.storageKey).catch(() => {})));
  } else {
    await prisma.adSet.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  return Response.json({ ok: true });
}
