import { useQuery } from "@tanstack/react-query";

interface PublicAppSettings {
  appBannerEnabled?: boolean;
  appBannerMessage?: string;
}

export function AppMessageBanner() {
  const { data } = useQuery<PublicAppSettings>({
    queryKey: ["public-app-settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings/public", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load app settings");
      return res.json() as Promise<PublicAppSettings>;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const enabled = data?.appBannerEnabled === true;
  const message = (data?.appBannerMessage ?? "").trim();

  if (!enabled || !message) return null;

  return (
    <div className="app-banner-root border-b border-border/70 bg-[#111111] text-[#f5f4f0]">
      <div className="app-banner-marquee" role="status" aria-live="polite">
        <div className="app-banner-track">
          <span className="app-banner-item">{message}</span>
          <span className="app-banner-item" aria-hidden="true">{message}</span>
        </div>
      </div>
    </div>
  );
}
