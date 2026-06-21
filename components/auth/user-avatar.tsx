import { avatarDataUri } from "@/lib/auth/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  username: string;
  className?: string;
  alt?: string;
}

export function UserAvatar({ username, className, alt }: UserAvatarProps) {
  return (
    <img
      src={avatarDataUri(username)}
      alt={alt ?? `${username} avatar`}
      className={cn("rounded-full bg-surface-03 object-cover", className)}
    />
  );
}
