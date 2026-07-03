import { auth } from "@/auth";
import { canAccessAgency } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { downloadVideo } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const ad = await prisma.ad.findUnique({ where: { id } });
  if (!ad || !canAccessAgency(session, ad.agencyId)) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = await downloadVideo(ad.storageKey);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": ad.mimeType,
      "Content-Length": String(buffer.length),
    },
  });
}
