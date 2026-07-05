import { lookup } from "dns/promises";
import { isIP } from "net";

export interface VideoInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

/** Rejects loopback, private, link-local and other non-public IP ranges to block SSRF. */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) || // link-local (incl. cloud metadata 169.254.169.254)
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === "::1" ||
    v6 === "::" ||
    v6.startsWith("fc") || // unique local
    v6.startsWith("fd") ||
    v6.startsWith("fe80") || // link-local
    v6.startsWith("::ffff:") // IPv4-mapped — resolve separately below
  );
}

/** Parses and validates a user-supplied asset URL, guarding against SSRF to internal hosts. */
async function assertSafePublicUrl(url: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That doesn't look like a valid URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http(s) links are supported");
  }

  const host = parsed.hostname;
  // If the host is a literal IP, check it directly; otherwise resolve every A/AAAA record.
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) {
    throw new Error("Could not resolve that link's host");
  }
  for (const address of addresses) {
    const bare = address.startsWith("::ffff:") ? address.slice(7) : address;
    if (isPrivateAddress(address) || isPrivateAddress(bare)) {
      throw new Error("That link points to a private or internal address");
    }
  }
  return parsed;
}

/** Server-side fetch of a video from a public asset link. Because the browser only sends the URL,
 * this bypasses the platform's request-body size limit — the right path for large single videos. */
export async function fetchVideoFromUrl(url: string): Promise<VideoInput> {
  const parsed = await assertSafePublicUrl(url);

  const res = await fetch(parsed, { redirect: "error" });
  if (!res.ok) {
    throw new Error(`Could not download that link (HTTP ${res.status})`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("video/")) {
    throw new Error(
      "That link didn't return a video file. Use the direct/download link for the asset " +
        "(e.g. Air's \"Copy direct link\" or Frame.io's asset download link), not the share page URL."
    );
  }

  const disposition = res.headers.get("content-disposition") ?? "";
  const dispositionMatch = disposition.match(/filename="?([^";]+)"?/i);
  const filename =
    dispositionMatch?.[1] ??
    decodeURIComponent(parsed.pathname.split("/").pop() || "") ??
    "agency-submission.mp4";

  const buffer = Buffer.from(await res.arrayBuffer());
  return { filename: filename || "agency-submission.mp4", mimeType: contentType, buffer };
}
