import { ListingSchema, type Listing } from "@/lib/schema";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export interface DropInfo {
  id: string;
  status: "running" | "done" | "error";
  error_code: string | null;
  source: { type: Listing["source"]["type"]; url: string | null };
  media_url: string | null;
  duration_s: number | null;
  width: number | null;
  height: number | null;
  transcript: Listing["transcript"] | null;
  frames: { file: string; t: number }[];
  thumbnail: string | null;
  created_at: string;
}

export interface BookingConfirmation {
  confirmation_id: string;
  listing_id: string;
  /** Guide-local time, e.g. "2026-10-20T16:00". */
  starts_at: string;
  ends_at: string;
}

export type ListingSummary = Omit<Listing, "transcript">;

export type ListingPatch = Partial<
  Pick<
    Listing,
    | "title"
    | "summary"
    | "description"
    | "category"
    | "subcategory"
    | "age_range"
    | "format"
    | "session"
    | "skills"
    | "tags"
    | "caption"
    | "thumbnail_frame"
    | "availability"
  >
>;

/** Absolute URL for an API path (media, captions, SSE). */
export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), init);
  } catch {
    throw new ApiError("NETWORK", "Can't reach the API.", 0);
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(err?.code ?? "INTERNAL", err?.message ?? res.statusText, res.status);
  }
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json" },
});

export const api = {
  createDropFromFile(file: File): Promise<{ drop_id: string }> {
    const form = new FormData();
    form.append("file", file);
    return request("/api/drops", { method: "POST", body: form });
  },
  createDropFromUrl(url: string): Promise<{ drop_id: string }> {
    return request("/api/drops", { method: "POST", ...json({ url }) });
  },
  getDrop(id: string): Promise<DropInfo> {
    return request(`/api/drops/${id}`);
  },
  retryDrop(id: string): Promise<{ drop_id: string }> {
    return request(`/api/drops/${id}/retry`, { method: "POST" });
  },
  async getListing(id: string): Promise<Listing> {
    return ListingSchema.parse(await request(`/api/listings/${id}`));
  },
  async listListings(): Promise<ListingSummary[]> {
    const { items } = await request<{ items: ListingSummary[] }>("/api/listings");
    return items;
  },
  async patchListing(id: string, patch: ListingPatch): Promise<Listing> {
    return ListingSchema.parse(
      await request(`/api/listings/${id}`, { method: "PATCH", ...json(patch) }),
    );
  },
  suggestPrice(params: {
    category: Listing["category"];
    group: Listing["format"]["group"];
    mode: Listing["format"]["mode"];
    duration_min: number;
  }): Promise<Listing["session"]["price_band"]> {
    const query = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    return request(`/api/listings/price-suggestion?${query}`);
  },
  book(id: string, slot: { date: string; start: string }): Promise<BookingConfirmation> {
    return request(`/api/listings/${id}/book`, { method: "POST", ...json(slot) });
  },
  eventsUrl(id: string): string {
    return apiUrl(`/api/drops/${id}/events`);
  },
  captionsUrl(id: string): string {
    return apiUrl(`/api/drops/${id}/captions.vtt`);
  },
};
