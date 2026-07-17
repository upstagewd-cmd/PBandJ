import { useEffect } from "react";
import { useUser } from "@clerk/react";
import { toast } from "@/hooks/use-toast";
import { ensureBadgeSeenBaseline, getSeenBadgeGrantIds, markSeenBadgeGrantIds } from "@/lib/badge-notification-state";

type ProfileBadge = {
  id: string;
  name: string;
  icon: string;
  grantId?: string;
  grantedBy?: string;
};

export function useBadgeUnlockToasts() {
  const { user } = useUser();

  useEffect(() => {
    if (!user?.id) return;

    let stopped = false;

    const loadAndNotify = async () => {
      try {
        const response = await fetch("/api/profile/me", { credentials: "include" });
        if (!response.ok) return;

        const data = (await response.json()) as { badges?: ProfileBadge[] };
        const badges = Array.isArray(data.badges) ? data.badges : [];
        const allGrantIds = badges
          .map((badge) => badge.grantId)
          .filter((grantId): grantId is string => typeof grantId === "string" && grantId.length > 0);

        ensureBadgeSeenBaseline(user.id, allGrantIds);

        const seen = getSeenBadgeGrantIds(user.id);
        const unseenSystemBadges = badges.filter(
          (badge) =>
            badge.grantedBy === "system" &&
            typeof badge.grantId === "string" &&
            badge.grantId.length > 0 &&
            !seen.has(badge.grantId)
        );

        if (stopped || unseenSystemBadges.length === 0) return;

        const title = unseenSystemBadges.length === 1
          ? `${unseenSystemBadges[0].icon} Badge Unlocked`
          : `🏅 ${unseenSystemBadges.length} Badges Unlocked`;
        const description = unseenSystemBadges
          .map((badge) => `${badge.icon} ${badge.name}`)
          .join(" • ");

        toast({
          title,
          description,
          duration: 2147483647,
        });

        markSeenBadgeGrantIds(
          user.id,
          unseenSystemBadges
            .map((badge) => badge.grantId)
            .filter((grantId): grantId is string => typeof grantId === "string" && grantId.length > 0)
        );
      } catch {
        // Ignore transient profile fetch errors.
      }
    };

    const intervalId = window.setInterval(loadAndNotify, 30000);
    const onFocus = () => {
      void loadAndNotify();
    };

    window.addEventListener("focus", onFocus);
    void loadAndNotify();

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [user?.id]);
}
