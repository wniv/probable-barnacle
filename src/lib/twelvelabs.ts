const API_BASE = "https://api.twelvelabs.io/v1.3";

function apiKey(): string {
  const key = process.env.TWELVE_LABS_API_KEY;
  if (!key) {
    throw new Error("TWELVE_LABS_API_KEY is not set");
  }
  return key;
}

function headers(extra?: Record<string, string>) {
  return { "x-api-key": apiKey(), ...extra };
}

async function assertOk(res: Response, action: string) {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Twelve Labs ${action} failed (${res.status}): ${body}`);
  }
}

interface AssetResponse {
  _id: string;
  status: string;
  filename: string;
}

export async function uploadAsset(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const form = new FormData();
  form.append("method", "direct");
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

  const res = await fetch(`${API_BASE}/assets`, {
    method: "POST",
    headers: headers(),
    body: form,
  });
  await assertOk(res, "asset upload");
  const data = (await res.json()) as AssetResponse;
  return data._id;
}

async function getAsset(assetId: string): Promise<AssetResponse> {
  const res = await fetch(`${API_BASE}/assets/${assetId}`, {
    headers: headers(),
  });
  await assertOk(res, "asset status check");
  return (await res.json()) as AssetResponse;
}

export async function waitForAssetReady(
  assetId: string,
  { timeoutMs = 3 * 60 * 1000, intervalMs = 3000 } = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const asset = await getAsset(assetId);
    if (asset.status === "ready") return;
    if (asset.status === "failed") {
      throw new Error(`Twelve Labs asset processing failed for ${assetId}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for Twelve Labs asset ${assetId} to become ready`);
}

export interface CaptionTypoIssue {
  timestamp: string | null;
  incorrectText: string | null;
  suggestion: string | null;
  description: string;
}

const CAPTION_TYPO_PROMPT = `You are a strict QA reviewer for video advertisements. Carefully read every piece of on-screen text in this video: burned-in captions, subtitles, titles, lower-thirds, and any other overlaid text. Identify every spelling mistake, typo, or grammatical error in that text.

For each issue found, report:
- the approximate timestamp (MM:SS) where it appears
- the exact incorrect text as it appears on screen
- a suggested correction
- a short description of the problem

If there are no typos anywhere in the video, return an empty issues array. Do not report style or phrasing preferences, only actual spelling/grammar errors.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp: { type: "string" },
          incorrect_text: { type: "string" },
          suggestion: { type: "string" },
          description: { type: "string" },
        },
        required: ["timestamp", "incorrect_text", "suggestion", "description"],
      },
    },
  },
  required: ["issues"],
};

interface NonStreamAnalyzeResponse {
  id: string;
  data: string;
  finish_reason: string;
}

export async function analyzeCaptionTypos(assetId: string): Promise<CaptionTypoIssue[]> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      model_name: "pegasus1.5",
      video: { type: "asset_id", asset_id: assetId },
      prompt: CAPTION_TYPO_PROMPT,
      stream: false,
      temperature: 0.1,
      response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
    }),
  });
  await assertOk(res, "analyze");
  const result = (await res.json()) as NonStreamAnalyzeResponse;

  let parsed: { issues?: Array<Record<string, string>> };
  try {
    parsed = JSON.parse(result.data);
  } catch {
    throw new Error(`Could not parse Twelve Labs analysis response: ${result.data}`);
  }

  return (parsed.issues ?? []).map((issue) => ({
    timestamp: issue.timestamp ?? null,
    incorrectText: issue.incorrect_text ?? null,
    suggestion: issue.suggestion ?? null,
    description: issue.description ?? "Caption typo detected",
  }));
}
