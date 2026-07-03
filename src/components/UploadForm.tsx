"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type SourceMode = "file" | "link";

export function UploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SourceMode>("file");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    if (mode === "file" && !(formData.get("file") as File)?.size) {
      setError("Please choose a video file");
      return;
    }
    if (mode === "link" && !(formData.get("videoUrl") as string)?.trim()) {
      setError("Please paste a video link");
      return;
    }
    // Only send the field for the active mode.
    if (mode === "file") {
      formData.delete("videoUrl");
    } else {
      formData.delete("file");
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/ads", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? "Upload failed");
      }
      formRef.current?.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="platform" className="text-sm font-medium">
          Platform
        </label>
        <select
          id="platform"
          name="platform"
          required
          disabled={isSubmitting}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="meta">Meta</option>
          <option value="tiktok">TikTok</option>
        </select>
      </div>

      <div className="flex gap-1 rounded-md bg-zinc-100 p-1 text-sm dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setMode("file")}
          disabled={isSubmitting}
          className={`flex-1 rounded px-3 py-1.5 transition-colors ${
            mode === "file"
              ? "bg-white shadow-sm dark:bg-zinc-800"
              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          }`}
        >
          Upload file
        </button>
        <button
          type="button"
          onClick={() => setMode("link")}
          disabled={isSubmitting}
          className={`flex-1 rounded px-3 py-1.5 transition-colors ${
            mode === "link"
              ? "bg-white shadow-sm dark:bg-zinc-800"
              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          }`}
        >
          Paste a link
        </button>
      </div>

      {mode === "file" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="file" className="text-sm font-medium">
            Ad video
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept="video/*"
            disabled={isSubmitting}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 dark:border-zinc-700 dark:bg-zinc-900 dark:file:bg-zinc-800"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="videoUrl" className="text-sm font-medium">
            Frame.io / Air link
          </label>
          <input
            id="videoUrl"
            name="videoUrl"
            type="url"
            placeholder="https://..."
            disabled={isSubmitting}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="text-xs text-zinc-500">
            Use the direct/download link for the asset (e.g. Air&apos;s &quot;Copy direct
            link&quot;, or Frame.io&apos;s asset download link) — not the share page URL.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {isSubmitting ? "Analyzing with Pegasus 1.5…" : "Submit & run QA"}
      </button>
      {isSubmitting && (
        <p className="text-xs text-zinc-500">
          This fetches the video and waits for the analysis to finish — it can take up to a
          minute or two depending on video length.
        </p>
      )}
    </form>
  );
}
