import { recomputeCommonIssues } from "@/lib/adsets";
import { prisma } from "@/lib/prisma";
import { getEnabledQaRules } from "@/lib/qarules";
import { downloadVideo } from "@/lib/storage";
import { analyzeWithPrompt, uploadAsset, waitForAssetReady } from "@/lib/twelvelabs";

/** Ad statuses that are terminal — no further processing will happen. */
export const TERMINAL_STATUSES = ["complete", "failed"];
/** The status an ad sits in after its bytes are stored, waiting to be picked up. */
export const QUEUED_STATUS = "queued";
/** How long a claimed ad can go without a status write before another worker treats the claim
 * as dead and re-claims it. Must exceed the longest single step (Twelve Labs asset wait). */
const STALE_LOCK_MS = 20 * 60 * 1000;

// Guards against processing the same set twice at once (e.g. the upload kick and a
// poll-driven resume racing). In-memory only, so a fresh process after a restart will
// re-pick-up any ads still left in a non-terminal state — that's the intended recovery path.
const inFlight = new Set<string>();

/**
 * Runs every enabled QA rule against a single already-stored ad: pulls the bytes back from
 * Object Storage, uploads them to Twelve Labs, waits for processing, analyzes, and persists
 * the issues. Advances `status` as it goes; on any failure records the message and marks failed.
 */
async function processAd(adId: string): Promise<void> {
  // Atomically claim the ad so two workers (e.g. separate Autoscale instances the poller
  // pinged) can't process the same video at once and write duplicate issues. We win the claim
  // only if it's freshly queued or a prior claim went stale — i.e. its worker died mid-run and
  // hasn't written a status update in STALE_LOCK_MS. The single UPDATE ... WHERE is the lock:
  // whichever worker flips the row first wins; the other sees count 0 and backs off.
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
  const claim = await prisma.ad.updateMany({
    where: {
      id: adId,
      status: { notIn: TERMINAL_STATUSES },
      OR: [{ status: QUEUED_STATUS }, { updatedAt: { lt: staleBefore } }],
    },
    data: { status: "uploading_to_twelvelabs" },
  });
  if (claim.count === 0) return; // already terminal, or another worker owns it

  const ad = await prisma.ad.findUnique({ where: { id: adId } });
  if (!ad) return;

  try {
    const buffer = await downloadVideo(ad.storageKey);
    const assetId = await uploadAsset(buffer, ad.filename, ad.mimeType);
    await prisma.ad.update({ where: { id: ad.id }, data: { status: "processing", assetId } });

    await waitForAssetReady(assetId);

    await prisma.ad.update({ where: { id: ad.id }, data: { status: "analyzing" } });

    const qaRules = await getEnabledQaRules();
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
}

/** Processes every not-yet-terminal ad in the set, one at a time, recomputing the set's
 * common/specific split after each so the UI can reflect progress as videos complete. */
async function processAdSet(adSetId: string): Promise<void> {
  // Pick up anything that isn't finished — covers both a fresh submission and resuming a set
  // whose processing was interrupted (e.g. the instance was recycled mid-run).
  const pending = await prisma.ad.findMany({
    where: { adSetId, status: { notIn: TERMINAL_STATUSES } },
    select: { id: true },
    orderBy: { filename: "asc" },
  });

  for (const ad of pending) {
    await processAd(ad.id);
    await recomputeCommonIssues(adSetId);
  }
}

/**
 * Fire-and-forget entry point: kicks off background processing for a set unless it's already
 * running in this process. Returns immediately — callers should not await the actual work.
 */
export function kickProcessing(adSetId: string): void {
  if (inFlight.has(adSetId)) return;
  inFlight.add(adSetId);

  processAdSet(adSetId)
    .catch((error) => {
      console.error(`Background processing for ad set ${adSetId} crashed:`, error);
    })
    .finally(() => {
      inFlight.delete(adSetId);
    });
}
