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
