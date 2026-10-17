import type { Listing } from "@/lib/schema";

export type SourceType = Listing["source"]["type"];

const HOSTS: [RegExp, SourceType][] = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
];

/** Returns the platform for a supported public video URL, or null. */
export function detectSource(value: string): Exclude<SourceType, "upload"> | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const match = HOSTS.find(([re]) => re.test(url.hostname.toLowerCase()));
  return match ? (match[1] as Exclude<SourceType, "upload">) : null;
}

/** The video id of a YouTube watch/shorts/youtu.be/embed link, else null. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./, "");
    if (host === "youtu.be") return u.pathname.slice(1) || null;
    if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const match = u.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
