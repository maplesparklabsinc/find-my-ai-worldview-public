// Link preview image for a result, 1200×630 (docs/01-product-spec.md 5.7).
import { notFound } from "next/navigation";
import { OG_SIZE, shareCard } from "@/components/share-card";
import { loadResponse, shown } from "@/lib/stored";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A result from Find My AI Worldview";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await loadResponse(id);
  if (!row) notFound();
  return shareCard(await shown(row), OG_SIZE);
}
