"use client";

import { useQuery } from "@tanstack/react-query";

import { EditorSkeleton } from "@/components/editor-skeleton";
import { ErrorState } from "@/components/error-state";
import { ListingEditor } from "@/components/listing-editor";
import { useListing } from "@/hooks/use-listing";
import { api, ApiError } from "@/lib/api";

export function ListingPage({ id }: { id: string }) {
  const listing = useListing(id);
  const drop = useQuery({ queryKey: ["drop", id], queryFn: () => api.getDrop(id) });

  if (listing.error) {
    const code = listing.error instanceof ApiError ? listing.error.code : null;
    return (
      <div className="mx-auto max-w-xl pt-16">
        <ErrorState code={code} onRetry={() => void listing.refetch()} />
      </div>
    );
  }
  if (!listing.data || drop.isPending) return <EditorSkeleton />;
  return <ListingEditor listing={listing.data} drop={drop.data} />;
}
