"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type SourceMode = "file" | "link";

// Each video is uploaded in its own request, which must stay under Cloud Run's 32 MiB HTTP/1
// body limit. Keep headroom for the multipart boundary and other fields.
const MAX_FILE_BYTES = 30 * 1024 * 1024;

export function UploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [mode, setMode] = useState<SourceMode>("file");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const name = (formData.get("name") as string)?.trim();
    const platform = (formData.get("platform") as string) || "meta";
    const videoUrl = (formData.get("videoUrl") as string)?.trim();

    if (!name) {
      setError("Please name this ad concept/set");
      return;
    }
    if (mode === "file" && selectedFiles.length === 0) {
      setError("Please choose at least one video file");
      return;
    }
    if (mode === "link" && !videoUrl) {
      setError("Please paste a video link");
      return;
    }
    if (mode === "file") {
      const tooBig = selectedFiles.filter((f) => f.size > MAX_FILE_BYTES);
      if (tooBig.length > 0) {
        setError(
          `Over the 30 MB per-file upload limit: ${tooBig.map((f) => f.name).join(", ")}. ` +
            `Compress them, or use the “Paste a link” tab — server-side fetch has no size limit.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // 1) Create the empty ad set (tiny JSON request).
      const setRes = await fetch("/api/ad-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const setBody = await setRes.json().catch(() => ({}));
      if (!setRes.ok) throw new Error(setBody.error ?? "Could not create the ad set");
      const setId: string = setBody.adSet.id;

      // 2) Upload each video one request at a time to stay under the request-size limit.
      const items =
        mode === "file"
          ? selectedFiles.map((file) => ({
              label: file.name,
              build: () => {
                const fd = new FormData();
                fd.append("platform", platform);
                fd.append("file", file);
                return fd;
              },
            }))
          : [
              {
                label: "link",
                build: () => {
                  const fd = new FormData();
                  fd.append("platform", platform);
                  fd.append("videoUrl", videoUrl!);
                  return fd;
                },
              },
            ];

      const failures: string[] = [];
      for (let i = 0; i < items.length; i++) {
        setProgress(`Uploading ${i + 1} of ${items.length}…`);
        try {
          const res = await fetch(`/api/ad-sets/${setId}/ads`, { method: "POST", body: items[i].build() });
          if (!res.ok) {
            const b = await res.json().catch(() => ({}));
            failures.push(b.error ? `${items[i].label} (${b.error})` : items[i].label);
          }
        } catch {
          failures.push(items[i].label);
        }
      }

      if (failures.length === items.length) {
        throw new Error(`Upload failed: ${failures.join("; ")}`);
      }
      if (failures.length > 0) {
        setError(`Some videos didn't upload: ${failures.join("; ")}`);
      }

      formRef.current?.reset();
      setSelectedFiles([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          Ad concept / set name
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="e.g. Summer Sale — Hook Variants"
          disabled={isSubmitting}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

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
          Upload files
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
          <label htmlFor="files" className="text-sm font-medium">
            Ad videos
          </label>
          <input
            id="files"
            name="files"
            type="file"
            accept="video/*"
            multiple
            disabled={isSubmitting}
            onChange={(e) => setSelectedFiles(Array.from(e.target.files ?? []))}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 dark:border-zinc-700 dark:bg-zinc-900 dark:file:bg-zinc-800"
          />
          <p className="text-xs text-zinc-500">
            Select multiple files to upload a full ad set at once — each file&apos;s name is used
            as that video&apos;s label. Typos found in more than one video will be flagged as a
            shared edit; the rest are called out per video.
          </p>
          {selectedFiles.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              {selectedFiles.map((file, i) => (
                <li key={i}>{file.name}</li>
              ))}
            </ul>
          )}
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
            link&quot;, or Frame.io&apos;s asset download link) — not the share page URL. One
            link per submission; use the file upload tab for multiple videos at once.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {isSubmitting ? progress ?? "Uploading…" : "Submit & run QA"}
      </button>
      {isSubmitting ? (
        <p className="text-xs text-zinc-500">{progress ?? "Uploading your video(s)…"}</p>
      ) : (
        <p className="text-xs text-zinc-500">
          Each video uploads separately (max 30 MB per file — use a link for anything larger), then
          Pegasus 1.5 analyzes them in the background. The list below updates on its own as results
          come in, so you can close this tab and check back later.
        </p>
      )}
    </form>
  );
}
