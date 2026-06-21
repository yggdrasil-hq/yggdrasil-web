import { cn } from "@/lib/utils";

interface YggdrasilLogoProps {
  className?: string;
  showWordmark?: boolean;
}

function MarkY({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "font-display text-[2rem] font-bold leading-none tracking-[-0.05em] text-bifrost",
        className,
      )}
    >
      Y
    </span>
  );
}

export function YggdrasilLogo({
  className,
  showWordmark = true,
}: YggdrasilLogoProps) {
  if (!showWordmark) {
    return (
      <div className={cn("flex items-center", className)}>
        <MarkY />
        <span className="sr-only">Yggdrasil</span>
      </div>
    );
  }

  return (
    <div
      className={cn("flex items-center", className)}
      aria-label="Yggdrasil"
    >
      <span className="text-lg font-semibold tracking-[-0.03em] whitespace-nowrap">
        <span className="font-display text-[1.32em] font-bold tracking-[-0.05em] text-bifrost -mr-[0.09em]">
          Y
        </span>
        <span className="text-bifrost">gg</span>
        <span className="text-frost">drasil</span>
      </span>
    </div>
  );
}
