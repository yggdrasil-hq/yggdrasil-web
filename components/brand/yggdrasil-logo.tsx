import { cn } from "@/lib/utils";

interface YggdrasilLogoProps {
  className?: string;
  showWordmark?: boolean;
}

export function YggdrasilLogo({
  className,
  showWordmark = true,
}: YggdrasilLogoProps) {
  const gradientId = "yggdrasil-mark-gradient";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        viewBox="170 55 120 120"
        className="size-8 shrink-0"
        aria-hidden
        role="img"
      >
        <title>Yggdrasil</title>
        <path
          d="M207.821 63.0558C214.668 72.4419 223.045 84.4718 229.464 98.1947C233.742 107.34 237.151 117.237 238.658 127.604C240.564 140.718 240.185 160.66 233.135 170M214.494 111.505C231.92 120.847 238.959 129.896 238.959 129.896C240.206 120.944 247.346 110.664 257.388 102.014C275.791 86.1634 272.716 91.8926 285.833 81.962M175.833 98.1947C186.45 98.0548 204.429 106.108 214.494 111.505M257.388 102.014C256.764 99.5697 257.388 86.1634 269.494 69.5489M229.464 98.1947C239.071 84.4603 252.465 77.9516 246.942 60.0002M214.494 111.505C210.537 103.365 217.256 94.1843 199.076 79.6704M224.39 118.629C224.39 118.629 210.352 116.91 199.191 121.78C188.03 126.65 175.833 116.146 175.833 116.146M283.302 102.014C283.302 102.014 278.699 110.226 247.284 112.518"
          stroke={`url(#${gradientId})`}
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
        <defs>
          <linearGradient
            id={gradientId}
            x1="237.967"
            y1="55.7989"
            x2="237.967"
            y2="170"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#4F9BF0" />
            <stop offset="0.5" stopColor="#2FD4C6" />
            <stop offset="1" stopColor="#2D598A" />
          </linearGradient>
        </defs>
      </svg>
      {showWordmark && (
        <span className="text-lg font-semibold tracking-tight text-frost">
          Yggdrasil
        </span>
      )}
    </div>
  );
}
