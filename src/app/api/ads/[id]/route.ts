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
  const ad = await prisma.ad.findUnique({
    where: { id },
    include: { issues: true },
  });
  if (!ad || !canAccessAgency(session, ad.agencyId)) {
    return Response.json({ error: "Ad not found" }, { status: 404 });
  }
  return Response.json({ ad });
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
  const ad = await prisma.ad.findUnique({ where: { id } });
  if (!ad || !canAccessAgency(session, ad.agencyId)) {
    return Response.json({ error: "Ad not found" }, { status: 404 });
  }

  await prisma.ad.delete({ where: { id } });
  await deleteVideo(ad.storageKey).catch(() => {});
  return Response.json({ ok: true });
}
