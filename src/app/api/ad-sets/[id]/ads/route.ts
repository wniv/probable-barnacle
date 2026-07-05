import { randomUUID } from "crypto";
import path from "path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { kickProcessing, QUEUED_STATUS } from "@/lib/processing";
import { uploadVideo } from "@/lib/storage";
import { fetchVideoFromUrl, type VideoInput } from "@/lib/videofetch";

/**
 * Adds a single video (an uploaded file, or a fetched-server-side asset link) to an existing ad
 * set, stores its bytes, and kicks background analysis. One video per request keeps each upload
 * under Cloud Run's 32 MiB HTTP/1 body limit — the client calls this once per file.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "AGENCY" || !session.user.agencyId) {
    return Response.json({ error: "Only agency accounts can submit ads" }, { status: 403 });
  }

  const { id: adSetId } = await params;
  const adSet = await prisma.adSet.findUnique({ where: { id: adSetId } });
  if (!adSet || adSet.agencyId !== session.user.agencyId || adSet.deletedAt) {
    return Response.json({ error: "Ad set not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const platform = formData.get("platform");
  const videoUrl = formData.get("videoUrl");
  const file = formData.get("file");

  if (platform !== "meta" && platform !== "tiktok") {
    return Response.json({ error: "platform must be 'meta' or 'tiktok'" }, { status: 400 });
  }

  let video: VideoInput;
  if (file instanceof File) {
    video = {
      filename: file.name,
      mimeType: file.type || "video/mp4",
      buffer: Buffer.from(await file.arrayBuffer()),
    };
  } else if (typeof videoUrl === "string" && videoUrl.trim()) {
    try {
      video = await fetchVideoFromUrl(videoUrl.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not fetch that link";
      return Response.json({ error: message }, { status: 400 });
    }
  } else {
    return Response.json({ error: "Provide a video file or a Frame.io/Air link" }, { status: 400 });
  }

  const ext = path.extname(video.filename) || ".mp4";
  const storageKey = `${randomUUID()}${ext}`;

  const ad = await prisma.ad.create({
    data: {
      filename: video.filename,
      storageKey,
      mimeType: video.mimeType,
      platform,
      status: QUEUED_STATUS,
      agencyId: session.user.agencyId,
      adSetId: adSet.id,
      createdByUserId: session.user.id,
    },
  });

  try {
    await uploadVideo(storageKey, video.buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not store video";
    await prisma.ad.update({ where: { id: ad.id }, data: { status: "failed", errorMessage: message } });
    return Response.json({ error: message }, { status: 502 });
  }

  kickProcessing(adSet.id);

  return Response.json({ ad: { id: ad.id, filename: ad.filename } }, { status: 201 });
}
