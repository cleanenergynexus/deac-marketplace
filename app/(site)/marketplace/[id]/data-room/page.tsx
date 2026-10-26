import { redirect } from "next/navigation";

// The data room now lives in the listing's "Data room" tab, opening further at each stage.
export default async function DataRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/marketplace/${id}?tab=documents`);
}
