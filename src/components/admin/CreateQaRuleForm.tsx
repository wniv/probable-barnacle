"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function CreateQaRuleForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    try {
      const res = await fetch("/api/admin/qa-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          prompt: formData.get("prompt"),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not create rule");
      formRef.current?.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create rule");
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
      <div className="flex flex-col gap-1">
        <label htmlFor="rule-name" className="text-xs font-medium text-zinc-500">
          New QA rule name
        </label>
        <input
          id="rule-name"
          name="name"
          required
          placeholder="e.g. Missing call-to-action"
          disabled={isSubmitting}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="rule-prompt" className="text-xs font-medium text-zinc-500">
          Prompt — describe what Pegasus should look for
        </label>
        <textarea
          id="rule-prompt"
          name="prompt"
          required
          rows={4}
          placeholder="e.g. Check whether the video includes a clear call-to-action (like 'Shop Now' or 'Sign Up') in the final 3 seconds. Flag it if there is no call-to-action, reporting the timestamp of the video's end and a description of what's missing."
          disabled={isSubmitting}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="text-xs text-zinc-500">
          For each instance found, Pegasus reports a timestamp, the flagged text (if any), a
          suggested fix (if any), and a description — the same shape as the built-in caption-typo
          check.
        </p>
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="self-start rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Add rule
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
