import { randomUUID } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";
import path from "path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { kickProcessing, QUEUED_STATUS } from "@/lib/processing";
import { uploadVideo } from "@/lib/storage";

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

  const adSet = await prisma.adSet.create({
    data: {
      name: name.trim(),
      agencyId: session.user.agencyId,
      createdByUserId: session.user.id,
    },
  });

  // Persist each video's bytes to Object Storage and create its row up front, then hand the
  // slow Twelve Labs work (upload → wait → analyze, minutes per video) to a background driver
  // so the request returns immediately instead of holding the connection open for the whole run.
  for (const video of videos) {
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

    // A single video failing to store shouldn't sink the whole batch — mark just that one failed.
    try {
      await uploadVideo(storageKey, video.buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not store video";
      await prisma.ad.update({ where: { id: ad.id }, data: { status: "failed", errorMessage: message } });
    }
  }

  kickProcessing(adSet.id);

  const result = await prisma.adSet.findUnique({
    where: { id: adSet.id },
    include: { ads: { include: { issues: true } } },
  });
  return Response.json({ adSet: result }, { status: 201 });
}

/** Rejects loopback, private, link-local and other non-public IP ranges to block SSRF. */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) || // link-local (incl. cloud metadata 169.254.169.254)
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === "::1" ||
    v6 === "::" ||
    v6.startsWith("fc") || // unique local
    v6.startsWith("fd") ||
    v6.startsWith("fe80") || // link-local
    v6.startsWith("::ffff:") // IPv4-mapped — resolve separately below
  );
}

/** Parses and validates a user-supplied asset URL, guarding against SSRF to internal hosts. */
async function assertSafePublicUrl(url: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That doesn't look like a valid URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http(s) links are supported");
  }

  const host = parsed.hostname;
  // If the host is a literal IP, check it directly; otherwise resolve every A/AAAA record.
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) {
    throw new Error("Could not resolve that link's host");
  }
  for (const address of addresses) {
    const bare = address.startsWith("::ffff:") ? address.slice(7) : address;
    if (isPrivateAddress(address) || isPrivateAddress(bare)) {
      throw new Error("That link points to a private or internal address");
    }
  }
  return parsed;
}

async function fetchVideoFromUrl(url: string): Promise<VideoInput> {
  const parsed = await assertSafePublicUrl(url);

  const res = await fetch(parsed, { redirect: "error" });
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
