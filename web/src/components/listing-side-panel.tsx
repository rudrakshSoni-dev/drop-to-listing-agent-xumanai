"use client";

import type { ReactNode } from "react";

import { SafetyPanel } from "@/components/safety-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Listing } from "@/lib/schema";

export function ListingSidePanel({
  listing,
  onSeek,
  preview,
}: {
  listing: Listing;
  onSeek?: (seconds: number) => void;
  /** The BookingPreview, built by the editor (it owns save + focus handlers). */
  preview: ReactNode;
}) {
  return (
    <Tabs defaultValue="preview">
      <TabsList className="w-full">
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="safety">Safety ({listing.guardrails.flags.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="preview" className="mt-4">
        {preview}
      </TabsContent>
      <TabsContent value="safety" className="mt-4">
        <SafetyPanel guardrails={listing.guardrails} onSeek={onSeek} />
      </TabsContent>
    </Tabs>
  );
}
