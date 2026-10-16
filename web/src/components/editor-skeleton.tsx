import { Skeleton } from "@/components/ui/skeleton";

export function EditorSkeleton() {
  return (
    <div className="space-y-6 pt-6 md:pt-8" aria-label="Loading listing">
      <Skeleton className="h-4 w-40" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 flex-1 md:max-w-md" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-20" />
      </div>
      <div className="grid gap-8 xl:grid-cols-[320px_1fr_380px]">
        <Skeleton className="hidden aspect-[9/16] max-h-[560px] rounded-xl xl:block" />
        <div className="space-y-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <Skeleton className="hidden h-[560px] rounded-xl xl:block" />
      </div>
    </div>
  );
}
