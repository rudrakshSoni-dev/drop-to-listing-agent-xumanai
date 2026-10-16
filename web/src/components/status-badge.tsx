import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type GuardrailStatus } from "@/lib/format";
import { cn } from "@/lib/utils";

const STYLES: Record<GuardrailStatus, { icon: typeof ShieldCheck; className: string }> = {
  pass: { icon: ShieldCheck, className: "border-success/40 bg-success/10 text-success" },
  warn: { icon: ShieldAlert, className: "border-warning/40 bg-warning/10 text-warning" },
  block: { icon: ShieldX, className: "border-destructive/40 bg-destructive/10 text-destructive" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: GuardrailStatus;
  className?: string;
}) {
  const { icon: Icon, className: tone } = STYLES[status];
  return (
    <Badge variant="outline" className={cn("gap-1 rounded-full", tone, className)}>
      <Icon className="size-3" aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
