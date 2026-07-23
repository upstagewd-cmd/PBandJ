import { cn } from "@/lib/utils";

interface Player {
  firstName: string;
  lastName: string;
  teamName?: string | null;
  avatarUrl?: string | null;
}

interface PlayerAvatarProps {
  player: Player;
  size?: "sm" | "md" | "lg" | "xl" | "xxl";
  className?: string;
}

const sizeMap = {
  sm: "w-7 h-7 text-[10px]",
  md: "w-9 h-9 text-xs",
  lg: "w-14 h-14 text-base",
  xl: "w-16 h-16 text-lg",
  xxl: "w-24 h-24 text-2xl",
};

function resolveAvatarSrc(avatarUrl?: string | null): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://") || avatarUrl.startsWith("data:")) {
    return avatarUrl;
  }
  if (avatarUrl.startsWith("/api/storage")) {
    return avatarUrl;
  }
  return `/api/storage${avatarUrl}`;
}

export function PlayerAvatar({ player, size = "md", className }: PlayerAvatarProps) {
  const initials = `${player.firstName.charAt(0)}${player.lastName.charAt(0)}`.toUpperCase();
  const avatarSrc = resolveAvatarSrc(player.avatarUrl);

  return (
    <div
      className={cn(
        "rounded-full shrink-0 overflow-hidden flex items-center justify-center font-bold bg-primary/20 text-primary border border-primary/30",
        sizeMap[size],
        className
      )}
    >
      {avatarSrc ? (
        <img
          src={avatarSrc}
          alt={initials}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback to initials on load error
            (e.target as HTMLImageElement).style.display = "none";
            const parent = (e.target as HTMLImageElement).parentElement;
            if (parent) parent.setAttribute("data-fallback", "true");
          }}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
