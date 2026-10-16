import { Film } from "lucide-react";

import { apiUrl } from "@/lib/api";

/** The listing's chosen key frame, or a neutral placeholder when there isn't one. */
export function ListingThumb({ id, frame }: { id: string; frame: string | null | undefined }) {
  if (!frame) return <Film className="text-muted-foreground size-8" aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- API-served jpg, sized by CSS
    <img
      src={apiUrl(`/api/media/${id}/${frame}`)}
      alt=""
      loading="lazy"
      className="absolute inset-0 size-full object-cover"
    />
  );
}
