import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  message,
  action,
  className,
}: {
  icon: LucideIcon;
  message: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("items-center gap-4 border-dashed p-8 text-center", className)}>
      <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-muted-foreground max-w-prose text-sm">{message}</p>
      {action}
    </Card>
  );
}
