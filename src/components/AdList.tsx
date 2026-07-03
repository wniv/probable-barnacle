import Link from "next/link";
import type { Ad, Agency, Issue } from "@/generated/prisma/client";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  uploading_to_twelvelabs: "Uploading…",
  processing: "Processing…",
  analyzing: "Analyzing…",
  complete: "Complete",
  failed: "Failed",
};

const STATUS_STYLE: Record<string, string> = {
  uploaded: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  uploading_to_twelvelabs: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  processing: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  analyzing: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  complete: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

type AdWithIssues = Ad & { issues: Issue[]; agency?: Agency };

export function AdList({ ads, showAgency = false }: { ads: AdWithIssues[]; showAgency?: boolean }) {
  if (ads.length === 0) {
    return (
      <p className="text-sm text-zinc-500">No ads uploaded yet. Upload one above to get started.</p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
      {ads.map((ad) => (
        <li key={ad.id}>
          <Link
            href={`/ads/${ad.id}`}
            className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{ad.filename}</span>
              <span className="text-xs uppercase tracking-wide text-zinc-500">
                {ad.platform}
                {showAgency && ad.agency ? ` · ${ad.agency.name}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {ad.status === "complete" && (
                <span className="text-xs text-zinc-500">
                  {ad.issues.length === 0
                    ? "No issues"
                    : `${ad.issues.length} issue${ad.issues.length === 1 ? "" : "s"}`}
                </span>
              )}
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[ad.status] ?? STATUS_STYLE.uploaded}`}
              >
                {STATUS_LABEL[ad.status] ?? ad.status}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
