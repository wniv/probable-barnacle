import { prisma } from "@/lib/prisma";

function normalizeIssueKey(issue: { type: string; incorrectText: string | null; description: string }): string {
  return `${issue.type}:${(issue.incorrectText ?? issue.description).trim().toLowerCase()}`;
}

interface IssueLike {
  incorrectText: string | null;
  suggestion: string | null;
  description: string;
  timestamp: string | null;
  type: string;
  isCommonToSet: boolean;
}

export interface CommonIssueGroup {
  key: string;
  incorrectText: string | null;
  suggestion: string | null;
  description: string;
  timestamp: string | null;
  videoFilenames: string[];
}

/** Groups the set's common issues by flagged text, listing which videos each one appears in. */
export function groupCommonIssues(ads: Array<{ filename: string; issues: IssueLike[] }>): CommonIssueGroup[] {
  const groups = new Map<string, CommonIssueGroup>();
  for (const ad of ads) {
    for (const issue of ad.issues) {
      if (!issue.isCommonToSet) continue;
      const key = normalizeIssueKey(issue);
      const existing = groups.get(key);
      if (existing) {
        if (!existing.videoFilenames.includes(ad.filename)) existing.videoFilenames.push(ad.filename);
      } else {
        groups.set(key, {
          key,
          incorrectText: issue.incorrectText,
          suggestion: issue.suggestion,
          description: issue.description,
          timestamp: issue.timestamp,
          videoFilenames: [ad.filename],
        });
      }
    }
  }
  return Array.from(groups.values());
}

/**
 * An issue is "common" when the same flagged text shows up in 2+ distinct
 * videos within the set (their shared body content), as opposed to being
 * unique to one video's hook. Recomputed after each video finishes analysis
 * so the set's common/specific split stays accurate as videos complete.
 */
export async function recomputeCommonIssues(adSetId: string): Promise<void> {
  const issues = await prisma.issue.findMany({
    where: { ad: { adSetId } },
    select: { id: true, adId: true, incorrectText: true, description: true, type: true },
  });

  const groups = new Map<string, { adIds: Set<string>; issueIds: string[] }>();
  for (const issue of issues) {
    const key = normalizeIssueKey(issue);
    const group = groups.get(key) ?? { adIds: new Set(), issueIds: [] };
    group.adIds.add(issue.adId);
    group.issueIds.push(issue.id);
    groups.set(key, group);
  }

  const commonIssueIds: string[] = [];
  const specificIssueIds: string[] = [];
  for (const group of groups.values()) {
    (group.adIds.size >= 2 ? commonIssueIds : specificIssueIds).push(...group.issueIds);
  }

  await prisma.$transaction([
    prisma.issue.updateMany({ where: { id: { in: commonIssueIds } }, data: { isCommonToSet: true } }),
    prisma.issue.updateMany({ where: { id: { in: specificIssueIds } }, data: { isCommonToSet: false } }),
  ]);
}
