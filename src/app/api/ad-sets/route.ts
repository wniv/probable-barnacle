import { randomUUID } from "crypto";
import path from "path";
import { auth } from "@/auth";
import { recomputeCommonIssues } from "@/lib/adsets";
import { prisma } from "@/lib/prisma";
import { getEnabledQaRules } from "@/lib/qarules";
import { uploadVideo } from "@/lib/storage";
import { analyzeWithPrompt, uploadAsset, waitForAssetReady } from "@/lib/twelvelabs";

interface VideoInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
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
  const name = formData.get("name");
  const platform = formData.get("platform");
  const videoUrl = formData.get("videoUrl");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "A concept/ad set name is required" }, { status: 400 });
  }
  if (platform !== "meta" && platform !== "tiktok") {
    return Response.json({ error: "platform must be 'meta' or 'tiktok'" }, { status: 400 });
  }

  let videos: VideoInput[];
  if (files.length > 0) {
    videos = await Promise.all(
      files.map(async (file) => ({
        filename: file.name,
        mimeType: file.type || "video/mp4",
        buffer: Buffer.from(await file.arrayBuffer()),
      }))
    );
  } else if (typeof videoUrl === "string" && videoUrl.trim()) {
    try {
      videos = [await fetchVideoFromUrl(videoUrl.trim())];
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not fetch that link";
      return Response.json({ error: message }, { status: 400 });
    }
  } else {
    return Response.json(
      { error: "Provide at least one video file or a Frame.io/Air link" },
      { status: 400 }
    );
  }

  const qaRules = await getEnabledQaRules();

  const adSet = await prisma.adSet.create({
    data: {
      name: name.trim(),
      agencyId: session.user.agencyId,
      createdByUserId: session.user.id,
    },
  });

  for (const video of videos) {
    const ext = path.extname(video.filename) || ".mp4";
    const storageKey = `${randomUUID()}${ext}`;

    const ad = await prisma.ad.create({
      data: {
        filename: video.filename,
        storageKey,
        mimeType: video.mimeType,
        platform,
        status: "uploaded",
        agencyId: session.user.agencyId,
        adSetId: adSet.id,
        createdByUserId: session.user.id,
      },
    });

    try {
      await uploadVideo(storageKey, video.buffer);

      await prisma.ad.update({ where: { id: ad.id }, data: { status: "uploading_to_twelvelabs" } });
      const assetId = await uploadAsset(video.buffer, video.filename, video.mimeType);
      await prisma.ad.update({ where: { id: ad.id }, data: { status: "processing", assetId } });

      await waitForAssetReady(assetId);

      await prisma.ad.update({ where: { id: ad.id }, data: { status: "analyzing" } });

      const issueRows: {
        adId: string;
        type: string;
        timestamp: string | null;
        incorrectText: string | null;
        suggestion: string | null;
        description: string;
      }[] = [];
      for (const rule of qaRules) {
        const issues = await analyzeWithPrompt(assetId, rule.prompt);
        for (const issue of issues) {
          issueRows.push({
            adId: ad.id,
            type: rule.type,
            timestamp: issue.timestamp,
            incorrectText: issue.incorrectText,
            suggestion: issue.suggestion,
            description: issue.description,
          });
        }
      }

      await prisma.$transaction([
        prisma.issue.createMany({ data: issueRows }),
        prisma.ad.update({ where: { id: ad.id }, data: { status: "complete" } }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error during analysis";
      await prisma.ad.update({ where: { id: ad.id }, data: { status: "failed", errorMessage: message } });
    }

    await recomputeCommonIssues(adSet.id);
  }

  const result = await prisma.adSet.findUnique({
    where: { id: adSet.id },
    include: { ads: { include: { issues: true } } },
  });
  return Response.json({ adSet: result }, { status: 201 });
}

async function fetchVideoFromUrl(url: string): Promise<VideoInput> {
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
