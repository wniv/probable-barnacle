import { auth } from "@/auth";
import { canAccessAgency } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
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
  if (!adSet || !canAccessAgency(session, adSet.agencyId)) {
    return Response.json({ error: "Ad set not found" }, { status: 404 });
  }
  return Response.json({ adSet });
}

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
  if (!adSet || !canAccessAgency(session, adSet.agencyId)) {
    return Response.json({ error: "Ad set not found" }, { status: 404 });
  }

  await prisma.adSet.delete({ where: { id } });
  await Promise.all(adSet.ads.map((ad) => deleteVideo(ad.storageKey).catch(() => {})));
  return Response.json({ ok: true });
}
