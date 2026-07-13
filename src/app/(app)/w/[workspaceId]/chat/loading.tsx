import { Skeleton } from "@/components/ui/skeleton";

export default function ChatIndexLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 lg:px-8">
      <Skeleton className="h-7 w-24" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      <Skeleton className="mt-6 h-24 w-full rounded-lg" />
      <Skeleton className="mt-8 mb-3 h-4 w-40" />
      <div className="space-y-px overflow-hidden rounded-lg border">
        <Skeleton className="h-16 w-full rounded-none" />
        <Skeleton className="h-16 w-full rounded-none" />
        <Skeleton className="h-16 w-full rounded-none" />
      </div>
    </div>
  );
}
