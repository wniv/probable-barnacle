export function IssueCard({
  timestamp,
  incorrectText,
  suggestion,
  description,
  badge,
}: {
  timestamp: string | null;
  incorrectText: string | null;
  suggestion: string | null;
  description: string;
  badge?: string;
}) {
  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-zinc-500">{timestamp ?? "—"}</span>
        {badge && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {badge}
          </span>
        )}
      </div>
      {incorrectText && (
        <p className="mt-2 text-sm">
          <span className="text-red-600 line-through dark:text-red-400">{incorrectText}</span>
          {suggestion && (
            <>
              {" → "}
              <span className="text-emerald-600 dark:text-emerald-400">{suggestion}</span>
            </>
          )}
        </p>
      )}
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
    </li>
  );
}
