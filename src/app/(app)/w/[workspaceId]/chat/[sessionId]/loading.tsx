import { Skeleton } from "@/components/ui/skeleton";

export default function ChatSessionLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-2 md:px-6 lg:px-8">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="flex-1 overflow-hidden px-4 py-4 md:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <Skeleton className="ml-auto h-10 w-2/3 rounded-lg" />
          <Skeleton className="h-16 w-3/4 rounded-lg" />
          <Skeleton className="ml-auto h-10 w-1/2 rounded-lg" />
        </div>
      </div>
      <div className="border-t px-4 py-3 md:px-6">
        <Skeleton className="mx-auto h-11 w-full max-w-3xl rounded-lg" />
      </div>
    </div>
  );
}
