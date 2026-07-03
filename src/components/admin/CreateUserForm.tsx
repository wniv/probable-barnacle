"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

function generatePassword() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

export function CreateUserForm({ agencies }: { agencies: { id: string; name: string }[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<"AGENCY" | "ADMIN">("AGENCY");
  const [password, setPassword] = useState(generatePassword());
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreated(null);
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email"));

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name: formData.get("name"),
          role,
          agencyId: formData.get("agencyId"),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not create user");
      setCreated({ email, password });
      formRef.current?.reset();
      setRole("AGENCY");
      setPassword(generatePassword());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create user");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="user-email" className="text-xs font-medium text-zinc-500">
            Email
          </label>
          <input
            id="user-email"
            name="email"
            type="email"
            required
            disabled={isSubmitting}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="user-name" className="text-xs font-medium text-zinc-500">
            Name (optional)
          </label>
          <input
            id="user-name"
            name="name"
            disabled={isSubmitting}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="user-role" className="text-xs font-medium text-zinc-500">
            Role
          </label>
          <select
            id="user-role"
            value={role}
            onChange={(e) => setRole(e.target.value as "AGENCY" | "ADMIN")}
            disabled={isSubmitting}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="AGENCY">Agency</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        {role === "AGENCY" && (
          <div className="flex flex-col gap-1">
            <label htmlFor="agencyId" className="text-xs font-medium text-zinc-500">
              Agency
            </label>
            <select
              id="agencyId"
              name="agencyId"
              required
              disabled={isSubmitting}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Select an agency…</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="col-span-2 flex flex-col gap-1">
          <label htmlFor="user-password" className="text-xs font-medium text-zinc-500">
            Temporary password (share this with them directly)
          </label>
          <input
            id="user-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting || (role === "AGENCY" && agencies.length === 0)}
        className="self-start rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Create user
      </button>

      {role === "AGENCY" && agencies.length === 0 && (
        <p className="text-sm text-zinc-500">Add an agency above first.</p>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {created && (
        <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700 dark:bg-emerald-900/10 dark:text-emerald-300">
          Created {created.email} — password: <span className="font-mono">{created.password}</span>
        </p>
      )}
    </form>
  );
}
