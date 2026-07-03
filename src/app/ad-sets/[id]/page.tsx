import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { groupCommonIssues } from "@/lib/adsets";
import { canAccessAgency } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { IssueCard } from "@/components/IssueCard";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  uploading_to_twelvelabs: "Uploading…",
  processing: "Processing…",
  analyzing: "Analyzing…",
  complete: "Complete",
  failed: "Failed",
};

export default async function AdSetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const adSet = await prisma.adSet.findUnique({
    where: { id },
    include: {
      agency: true,
      ads: { include: { issues: true }, orderBy: { filename: "asc" } },
    },
  });

  if (!adSet || !canAccessAgency(session, adSet.agencyId)) {
    notFound();
  }

  const commonIssues = groupCommonIssues(adSet.ads);
  const platform = adSet.ads[0]?.platform;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Back to all ad concepts
        </Link>

        <div>
          <h1 className="text-xl font-semibold tracking-tight">{adSet.name}</h1>
          <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
            {platform} · {adSet.ads.length} video{adSet.ads.length === 1 ? "" : "s"}
            {session.user.role === "ADMIN" ? ` · ${adSet.agency.name}` : ""}
          </p>
        </div>

        {commonIssues.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-zinc-500">
              Common edits — apply to every video listed ({commonIssues.length})
            </h2>
            <ul className="flex flex-col gap-3">
              {commonIssues.map((issue) => (
                <IssueCard
                  key={issue.key}
                  timestamp={issue.timestamp}
                  incorrectText={issue.incorrectText}
                  suggestion={issue.suggestion}
                  description={issue.description}
                  badge={`In ${issue.videoFilenames.length} of ${adSet.ads.length} videos`}
                />
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-6">
          <h2 className="text-sm font-medium text-zinc-500">Videos</h2>
          {adSet.ads.map((ad) => {
            const specificIssues = ad.issues.filter((issue) => !issue.isCommonToSet);
            return (
              <div
                key={ad.id}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{ad.filename}</span>
                  <span className="text-xs text-zinc-500">{STATUS_LABEL[ad.status] ?? ad.status}</span>
                </div>

                <video
                  src={`/api/ads/${ad.id}/video`}
                  controls
                  className="w-full max-w-sm self-center rounded-lg border border-zinc-200 dark:border-zinc-800"
                />

                {ad.status === "failed" && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
                    Analysis failed: {ad.errorMessage}
                  </div>
                )}

                {ad.status === "complete" && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-medium text-zinc-500">
                      {specificIssues.length > 0
                        ? `Edits specific to this video (${specificIssues.length})`
                        : "No edits specific to this video"}
                    </h3>
                    {specificIssues.length > 0 && (
                      <ul className="flex flex-col gap-2">
                        {specificIssues.map((issue) => (
                          <IssueCard
                            key={issue.id}
                            timestamp={issue.timestamp}
                            incorrectText={issue.incorrectText}
                            suggestion={issue.suggestion}
                            description={issue.description}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
