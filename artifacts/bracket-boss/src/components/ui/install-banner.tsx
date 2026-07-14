import { Share, Plus, X } from "lucide-react";
import type { Platform } from "@/hooks/use-install-prompt";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallBannerProps {
  shouldShow: boolean;
  platform: Platform;
  dismiss: () => void;
  triggerInstall: () => Promise<void>;
  deferredPrompt: BeforeInstallPromptEvent | null;
}

export function InstallBanner({
  shouldShow,
  platform,
  dismiss,
  triggerInstall,
  deferredPrompt,
}: InstallBannerProps) {

  if (!shouldShow) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white border border-[#E9E7E1] rounded-2xl shadow-xl overflow-hidden max-w-sm w-full">
        <div className="flex items-start gap-3 p-4">
          <img
            src={`${import.meta.env.BASE_URL}logo-favicon.png`}
            alt="PB&J"
            className="w-12 h-12 rounded-xl shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="font-display text-base text-[#111111]">Install PB&amp;J</p>
            <p className="text-xs text-[#737373] mt-0.5 leading-relaxed">
              Add to your home screen for one-tap access to tournaments, rankings, and open play.
            </p>
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 text-[#9ca3af] hover:text-[#2A2A2A] transition-colors p-1 -mt-1 -mr-1"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {platform === "ios" ? (
          <div className="border-t border-[#E9E7E1] px-4 py-3 space-y-2 bg-[#f5f4f0]">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#9ca3af]">How to install</p>
            <div className="flex items-center gap-3 text-xs text-[#2A2A2A]">
              <span className="w-5 h-5 rounded-full bg-[#B7E334]/20 text-[#111111] flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
              <span>Tap <Share className="inline w-3 h-3 mb-0.5" /> <strong>Share</strong> in Safari</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#2A2A2A]">
              <span className="w-5 h-5 rounded-full bg-[#B7E334]/20 text-[#111111] flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
              <span>Tap <strong>"Add to Home Screen"</strong></span>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#2A2A2A]">
              <span className="w-5 h-5 rounded-full bg-[#B7E334]/20 text-[#111111] flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
              <span>Tap <Plus className="inline w-3 h-3 mb-0.5" /> <strong>Add</strong></span>
            </div>
          </div>
        ) : (
          <div className="border-t border-[#E9E7E1] px-4 py-3 bg-[#f5f4f0]">
            {deferredPrompt ? (
              <button
                onClick={triggerInstall}
                className="w-full h-10 bg-[#B7E334] hover:bg-[#a5cc2a] text-[#111111] text-sm font-bold rounded-xl transition-colors"
              >
                Install App
              </button>
            ) : (
              <p className="text-xs text-[#737373] text-center py-1">
                Use your browser menu to <strong className="text-[#2A2A2A]">Install App</strong>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
