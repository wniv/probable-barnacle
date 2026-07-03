import { prisma } from "@/lib/prisma";
import type { QaRule } from "@/generated/prisma/client";

const DEFAULT_RULE = {
  name: "Caption typos",
  type: "caption_typo",
  prompt: `You are a strict QA reviewer for video advertisements. Carefully read every piece of on-screen text in this video: burned-in captions, subtitles, titles, lower-thirds, and any other overlaid text. Identify every spelling mistake, typo, or grammatical error in that text.

For each issue found, report:
- the approximate timestamp (MM:SS) where it appears
- the exact incorrect text as it appears on screen
- a suggested correction
- a short description of the problem

If there are no typos anywhere in the video, return an empty issues array. Do not report style or phrasing preferences, only actual spelling/grammar errors.`,
};

/**
 * Returns every enabled QA rule to run during analysis. Self-seeds the original
 * caption-typo rule on first use so existing installs keep working unchanged
 * after this table was introduced.
 */
export async function getEnabledQaRules(): Promise<QaRule[]> {
  const count = await prisma.qaRule.count();
  if (count === 0) {
    await prisma.qaRule.create({ data: DEFAULT_RULE });
  }
  return prisma.qaRule.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
}

export function slugifyRuleType(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "rule";
}

/** Slugifies the name into a unique Issue.type slug, appending a numeric suffix on collision. */
export async function generateUniqueRuleType(name: string): Promise<string> {
  const base = slugifyRuleType(name);
  let candidate = base;
  let suffix = 2;
  while (await prisma.qaRule.findUnique({ where: { type: candidate } })) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}
