import type { Metadata } from "next";

import { DropView } from "@/components/drop-view";

export const metadata: Metadata = { title: "Building listing" };

export default async function DropPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DropView id={id} />;
}
