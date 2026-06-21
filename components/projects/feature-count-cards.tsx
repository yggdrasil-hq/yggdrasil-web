import type { FeatureCounts } from "@/lib/features/types";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface FeatureCountCardsProps {
  counts: FeatureCounts;
}

const cards = [
  { key: "planned" as const, label: "Planned", description: "Spec grill or ADR review" },
  {
    key: "inProgress" as const,
    label: "Being worked on",
    description: "Build dispatched or in review",
  },
  { key: "completed" as const, label: "Completed", description: "Merged or cancelled" },
];

export function FeatureCountCards({ counts }: FeatureCountCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.key}>
          <CardHeader>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{counts[card.key]}</CardTitle>
            <CardDescription>{card.description}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
