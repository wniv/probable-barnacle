import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdList } from "@/components/AdList";
import { UploadForm } from "@/components/UploadForm";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "ADMIN";
  const ads = await prisma.ad.findMany({
    where: isAdmin ? {} : { agencyId: session.user.agencyId ?? "" },
    orderBy: { createdAt: "desc" },
    include: { issues: true, agency: true },
  });

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ad QA</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {isAdmin
              ? "Ads submitted by every agency."
              : "Upload a Meta or TikTok ad and Pegasus 1.5 will flag caption typos automatically."}
          </p>
        </div>

        {!isAdmin && <UploadForm />}

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-500">
            {isAdmin ? "All ads" : "Uploaded ads"}
          </h2>
          <AdList ads={ads} showAgency={isAdmin} />
        </div>
      </main>
    </div>
  );
}
