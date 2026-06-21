import { getStatusMeta, type FeatureStatus } from "@/lib/features/statuses";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: FeatureStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const meta = getStatusMeta(status);

  return (
    <Badge
      variant="outline"
      className={cn("border-transparent text-[11px] font-medium", className)}
      style={{
        backgroundColor: `${meta.color}22`,
        color: meta.color,
      }}
    >
      {meta.label}
    </Badge>
  );
}
