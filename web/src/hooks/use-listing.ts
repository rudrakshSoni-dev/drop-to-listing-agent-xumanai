"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type ListingPatch } from "@/lib/api";

export const listingKey = (id: string) => ["listing", id] as const;

export function useListing(id: string, enabled = true) {
  return useQuery({ queryKey: listingKey(id), queryFn: () => api.getListing(id), enabled });
}

export function useListings() {
  return useQuery({ queryKey: ["listings"], queryFn: api.listListings });
}

export function useUpdateListing(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ListingPatch) => api.patchListing(id, patch),
    onSuccess: (listing) => {
      queryClient.setQueryData(listingKey(id), listing);
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
  });
}
