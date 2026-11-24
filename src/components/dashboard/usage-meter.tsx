import { Progress } from "@/components/ui/progress";

export function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {used} / {limit ?? "∞"}
        </span>
      </div>
      {/* Unlimited resources show a thin, neutral bar. */}
      <Progress value={limit === null ? 4 : (used / limit) * 100} />
    </div>
  );
}
