import type { Metadata } from "next";

import { ListingPage } from "@/components/listing-page";

export const metadata: Metadata = { title: "Edit listing" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListingPage id={id} />;
}
