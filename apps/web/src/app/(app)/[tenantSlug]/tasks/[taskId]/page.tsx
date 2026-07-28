import { redirect } from "next/navigation";

export default async function LegacyTaskDetailPage({ params }: { params: Promise<{ tenantSlug: string; taskId: string }> }) {
  const { tenantSlug, taskId } = await params;
  redirect(`/${tenantSlug}/tasks?task=${encodeURIComponent(taskId)}`);
}
