"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteAdSetButton({
  adSetId,
  isAdmin,
  redirectTo,
}: {
  adSetId: string;
  isAdmin: boolean;
  /** Where to navigate after a successful delete. If omitted, the current page is refreshed in place. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    const confirmed = window.confirm(
      isAdmin
        ? "Permanently delete this ad concept and all its videos? This cannot be undone."
        : "Delete this ad concept? An admin will still be able to see it."
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/ad-sets/${adSetId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Delete failed");
      }
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-xs text-red-600 underline hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
    >
      {isDeleting ? "Deleting…" : isAdmin ? "Delete permanently" : "Delete"}
    </button>
  );
}
