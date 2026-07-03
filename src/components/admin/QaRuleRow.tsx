"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QaRule } from "@/generated/prisma/client";

export function QaRuleRow({ rule }: { rule: QaRule }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(rule.name);
  const [prompt, setPrompt] = useState(rule.prompt);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(data: Record<string, unknown>) {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/qa-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Update failed");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave() {
    const ok = await patch({ name, prompt });
    if (ok) setIsEditing(false);
  }

  async function handleToggleEnabled() {
    await patch({ enabled: !rule.enabled });
  }

  async function handleDelete() {
    if (!window.confirm(`Delete the "${rule.name}" QA rule? Past results aren't affected.`)) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/qa-rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Delete failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setIsSaving(false);
    }
  }

  if (isEditing) {
    return (
      <li className="flex flex-col gap-2 px-5 py-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isSaving}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          disabled={isSaving}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setName(rule.name);
              setPrompt(rule.prompt);
              setIsEditing(false);
              setError(null);
            }}
            disabled={isSaving}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{rule.name}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              rule.enabled
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {rule.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            disabled={isSaving}
            className="text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleToggleEnabled}
            disabled={isSaving}
            className="text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {rule.enabled ? "Disable" : "Enable"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isSaving}
            className="text-red-600 underline hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
          >
            Delete
          </button>
        </div>
      </div>
      <p className="line-clamp-2 text-xs text-zinc-500">{rule.prompt}</p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </li>
  );
}
