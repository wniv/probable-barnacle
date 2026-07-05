import Link from "next/link";
import type { Ad, AdSet, Agency, Issue } from "@/generated/prisma/client";
import { DeleteAdSetButton } from "@/components/DeleteAdSetButton";

type AdWithIssues = Ad & { issues: Issue[] };
type AdSetWithAds = AdSet & { ads: AdWithIssues[]; agency?: Agency };

function aggregateStatus(ads: AdWithIssues[]): "processing" | "complete" | "failed" | "partial" {
  const inProgress = ["queued", "uploaded", "uploading_to_twelvelabs", "processing", "analyzing"];
  if (ads.some((ad) => inProgress.includes(ad.status))) return "processing";
  if (ads.every((ad) => ad.status === "complete")) return "complete";
  if (ads.every((ad) => ad.status === "failed")) return "failed";
  return "partial";
}

const STATUS_LABEL: Record<string, string> = {
  processing: "Processing…",
  complete: "Complete",
  failed: "Failed",
  partial: "Needs attention",
};

const STATUS_STYLE: Record<string, string> = {
  processing: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  complete: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  partial: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
};

export function AdSetList({ adSets, showAgency = false }: { adSets: AdSetWithAds[]; showAgency?: boolean }) {
  if (adSets.length === 0) {
    return (
      <p className="text-sm text-zinc-500">No ad sets uploaded yet. Upload one above to get started.</p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
      {adSets.map((adSet) => {
        const status = aggregateStatus(adSet.ads);
        const allIssues = adSet.ads.flatMap((ad) => ad.issues);
        const commonCount = allIssues.filter((issue) => issue.isCommonToSet).length;
        const platform = adSet.ads[0]?.platform;

        return (
          <li key={adSet.id} className="flex items-center gap-2 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-900">
            <Link href={`/ad-sets/${adSet.id}`} className="flex flex-1 items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{adSet.name}</span>
                <span className="text-xs uppercase tracking-wide text-zinc-500">
                  {platform}
                  {showAgency && adSet.agency ? ` · ${adSet.agency.name}` : ""}
                  {` · ${adSet.ads.length} video${adSet.ads.length === 1 ? "" : "s"}`}
                  {adSet.deletedAt ? " · Deleted" : ""}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {status === "complete" || status === "partial" ? (
                  <span className="text-xs text-zinc-500">
                    {allIssues.length === 0
                      ? "No issues"
                      : `${allIssues.length} issue${allIssues.length === 1 ? "" : "s"}${
                          commonCount > 0 ? ` (${commonCount} shared)` : ""
                        }`}
                  </span>
                ) : null}
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}
                >
                  {STATUS_LABEL[status]}
                </span>
              </div>
            </Link>
            <DeleteAdSetButton adSetId={adSet.id} isAdmin={showAgency} />
          </li>
        );
      })}
    </ul>
  );
}
