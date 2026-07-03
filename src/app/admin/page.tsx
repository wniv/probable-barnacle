import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateAgencyForm } from "@/components/admin/CreateAgencyForm";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  const [agencies, users] = await Promise.all([
    prisma.agency.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { ads: true, users: true } } } }),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, include: { agency: true } }),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage agencies and their user accounts.</p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-500">Agencies</h2>
          <CreateAgencyForm />
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {agencies.length === 0 && (
              <li className="px-5 py-4 text-sm text-zinc-500">No agencies yet.</li>
            )}
            {agencies.map((agency) => (
              <li key={agency.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>{agency.name}</span>
                <span className="text-xs text-zinc-500">
                  {agency._count.users} user{agency._count.users === 1 ? "" : "s"} ·{" "}
                  {agency._count.ads} ad{agency._count.ads === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-500">Users</h2>
          <CreateUserForm agencies={agencies.map((a) => ({ id: a.id, name: a.name }))} />
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {users.length === 0 && (
              <li className="px-5 py-4 text-sm text-zinc-500">No users yet.</li>
            )}
            {users.map((user) => (
              <li key={user.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>{user.email}</span>
                <span className="text-xs text-zinc-500">
                  {user.role === "ADMIN" ? "Admin" : user.agency?.name ?? "No agency"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
