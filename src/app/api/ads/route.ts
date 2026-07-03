import { randomUUID } from "crypto";
import path from "path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uploadVideo } from "@/lib/storage";
import { analyzeCaptionTypos, uploadAsset, waitForAssetReady } from "@/lib/twelvelabs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ads = await prisma.ad.findMany({
    where: session.user.role === "ADMIN" ? {} : { agencyId: session.user.agencyId ?? "" },
    orderBy: { createdAt: "desc" },
    include: { issues: true, agency: true },
  });
  return Response.json({ ads });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "AGENCY" || !session.user.agencyId) {
    return Response.json(
      { error: "Only agency accounts can submit ads" },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const videoUrl = formData.get("videoUrl");
  const platform = formData.get("platform");

  if (platform !== "meta" && platform !== "tiktok") {
    return Response.json({ error: "platform must be 'meta' or 'tiktok'" }, { status: 400 });
  }

  let filename: string;
  let mimeType: string;
  let buffer: Buffer;

  if (file instanceof File) {
    filename = file.name;
    mimeType = file.type || "video/mp4";
    buffer = Buffer.from(await file.arrayBuffer());
  } else if (typeof videoUrl === "string" && videoUrl.trim()) {
    try {
      ({ filename, mimeType, buffer } = await fetchVideoFromUrl(videoUrl.trim()));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not fetch that link";
      return Response.json({ error: message }, { status: 400 });
    }
  } else {
    return Response.json(
      { error: "Provide either a video file or a Frame.io/Air link" },
      { status: 400 }
    );
  }

  const ext = path.extname(filename) || ".mp4";
  const storageKey = `${randomUUID()}${ext}`;

  const ad = await prisma.ad.create({
    data: {
      filename,
      storageKey,
      mimeType,
      platform,
      status: "uploaded",
      agencyId: session.user.agencyId,
      createdByUserId: session.user.id,
    },
  });

  try {
    await uploadVideo(storageKey, buffer);

    await prisma.ad.update({ where: { id: ad.id }, data: { status: "uploading_to_twelvelabs" } });
    const assetId = await uploadAsset(buffer, filename, mimeType);
    await prisma.ad.update({ where: { id: ad.id }, data: { status: "processing", assetId } });

    await waitForAssetReady(assetId);

    await prisma.ad.update({ where: { id: ad.id }, data: { status: "analyzing" } });
    const issues = await analyzeCaptionTypos(assetId);

    await prisma.$transaction([
      prisma.issue.createMany({
        data: issues.map((issue) => ({
          adId: ad.id,
          type: "caption_typo",
          timestamp: issue.timestamp,
          incorrectText: issue.incorrectText,
          suggestion: issue.suggestion,
          description: issue.description,
        })),
      }),
      prisma.ad.update({ where: { id: ad.id }, data: { status: "complete" } }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error during analysis";
    await prisma.ad.update({ where: { id: ad.id }, data: { status: "failed", errorMessage: message } });
    return Response.json({ error: message, adId: ad.id }, { status: 502 });
  }

  const result = await prisma.ad.findUnique({ where: { id: ad.id }, include: { issues: true } });
  return Response.json({ ad: result }, { status: 201 });
}

async function fetchVideoFromUrl(
  url: string
): Promise<{ filename: string; mimeType: string; buffer: Buffer }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That doesn't look like a valid URL");
  }

  const res = await fetch(parsed);
  if (!res.ok) {
    throw new Error(`Could not download that link (HTTP ${res.status})`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("video/")) {
    throw new Error(
      "That link didn't return a video file. Use the direct/download link for the asset " +
        "(e.g. Air's \"Copy direct link\" or Frame.io's asset download link), not the share page URL."
    );
  }

  const disposition = res.headers.get("content-disposition") ?? "";
  const dispositionMatch = disposition.match(/filename="?([^";]+)"?/i);
  const filename =
    dispositionMatch?.[1] ??
    decodeURIComponent(parsed.pathname.split("/").pop() || "") ??
    "agency-submission.mp4";

  const buffer = Buffer.from(await res.arrayBuffer());
  return { filename: filename || "agency-submission.mp4", mimeType: contentType, buffer };
}
