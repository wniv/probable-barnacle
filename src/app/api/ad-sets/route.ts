import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Creates an empty ad set. Videos are uploaded separately, one request each, via
 * POST /api/ad-sets/[id]/ads — Cloud Run caps HTTP/1 request bodies at 32 MiB, so bundling a
 * whole set into one multipart upload gets rejected by the load balancer with an HTML error.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "AGENCY" || !session.user.agencyId) {
    return Response.json({ error: "Only agency accounts can submit ads" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return Response.json({ error: "A concept/ad set name is required" }, { status: 400 });
  }

  const adSet = await prisma.adSet.create({
    data: {
      name,
      agencyId: session.user.agencyId,
      createdByUserId: session.user.id,
    },
  });

  return Response.json({ adSet: { id: adSet.id } }, { status: 201 });
}
