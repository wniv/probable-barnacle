import { auth } from "@/auth";
import { canAccessAgency } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { downloadVideo } from "@/lib/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const ad = await prisma.ad.findUnique({
    where: { id },
    include: { adSet: { select: { deletedAt: true } } },
  });
  const isAdmin = session.user.role === "ADMIN";
  if (!ad || !canAccessAgency(session, ad.agencyId) || (!isAdmin && ad.adSet.deletedAt)) {
    return new Response("Not found", { status: 404 });
  }

  // The stored object can be missing (e.g. a prior partial/failed upload). Degrade to a 404
  // instead of a 500 so the page just shows an unplayable <video> rather than erroring.
  let buffer: Buffer;
  try {
    buffer = await downloadVideo(ad.storageKey);
  } catch (error) {
    console.error(`Video object missing for ad ${ad.id} (${ad.storageKey}):`, error);
    return new Response("Video unavailable", { status: 404 });
  }
  const total = buffer.length;

  // Honor HTTP range requests so the <video> player can scrub/seek — Safari in
  // particular won't play a video served without 206/Accept-Ranges support.
  const range = request.headers.get("range");
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (match) {
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? parseInt(match[2], 10) : total - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
      return new Response("Requested range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${total}` },
      });
    }

    const clampedEnd = Math.min(end, total - 1);
    const chunk = buffer.subarray(start, clampedEnd + 1);
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: {
        "Content-Type": ad.mimeType,
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${start}-${clampedEnd}/${total}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": ad.mimeType,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
    },
  });
}
