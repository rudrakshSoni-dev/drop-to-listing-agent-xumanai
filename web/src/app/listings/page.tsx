import type { Metadata } from "next";

import { ListingsGrid } from "@/components/listings-grid";

export const metadata: Metadata = { title: "Listings" };

export default function ListingsPage() {
  return <ListingsGrid />;
}
