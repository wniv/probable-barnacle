import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { canAccessAgency } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const ad = await prisma.ad.findUnique({ where: { id }, include: { issues: true, agency: true } });

  if (!ad || !canAccessAgency(session, ad.agencyId)) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Back to all ads
        </Link>

        <div>
          <h1 className="text-xl font-semibold tracking-tight">{ad.filename}</h1>
          <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
            {ad.platform} · {ad.status}
            {session.user.role === "ADMIN" ? ` · ${ad.agency.name}` : ""}
          </p>
        </div>

        <video
          src={`/api/ads/${ad.id}/video`}
          controls
          className="w-full max-w-md self-center rounded-lg border border-zinc-200 dark:border-zinc-800"
        />

        {ad.status === "failed" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
            Analysis failed: {ad.errorMessage}
          </div>
        )}

        {ad.status === "complete" && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-zinc-500">
              Caption typos {ad.issues.length > 0 ? `(${ad.issues.length})` : ""}
            </h2>

            {ad.issues.length === 0 ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-300">
                No caption typos found.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {ad.issues.map((issue) => (
                  <li
                    key={issue.id}
                    className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-500">
                        {issue.timestamp ?? "—"}
                      </span>
                    </div>
                    {issue.incorrectText && (
                      <p className="mt-2 text-sm">
                        <span className="text-red-600 line-through dark:text-red-400">
                          {issue.incorrectText}
                        </span>
                        {issue.suggestion && (
                          <>
                            {" → "}
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {issue.suggestion}
                            </span>
                          </>
                        )}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {issue.description}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
