import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/features/status-badge";
import type { Feature } from "@/lib/features/types";

interface FeatureCardProps {
  feature: Feature;
  projectId: string;
}

export function FeatureCard({ feature, projectId }: FeatureCardProps) {
  const updatedLabel = formatDistanceToNow(new Date(feature.updatedAt), {
    addSuffix: true,
  });

  return (
    <Link
      href={`/projects/${projectId}/features/${feature.id}`}
      className="block transition-opacity hover:opacity-90"
    >
      <Card className="h-full hover:border-rime">
        <CardHeader>
          <CardTitle className="text-base">{feature.title}</CardTitle>
          <CardDescription>{feature.specExcerpt}</CardDescription>
        </CardHeader>
        <CardFooter>
          <span className="text-xs text-shadow">{updatedLabel}</span>
          <StatusBadge status={feature.status} />
        </CardFooter>
      </Card>
    </Link>
  );
}
