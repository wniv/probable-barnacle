import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdSetList } from "@/components/AdSetList";
import { UploadForm } from "@/components/UploadForm";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "ADMIN";
  const adSets = await prisma.adSet.findMany({
    where: isAdmin
      ? {}
      : { agencyId: session.user.agencyId ?? "", deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { ads: { include: { issues: true } }, agency: true },
  });

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ad QA</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {isAdmin
              ? "Ad concepts submitted by every agency."
              : "Upload a Meta or TikTok ad concept — one video or a whole hook-variant set — and Pegasus 1.5 will flag caption typos automatically."}
          </p>
        </div>

        {!isAdmin && <UploadForm />}

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-500">
            {isAdmin ? "All ad concepts" : "Uploaded ad concepts"}
          </h2>
          <AdSetList adSets={adSets} showAgency={isAdmin} />
        </div>
      </main>
    </div>
  );
}
