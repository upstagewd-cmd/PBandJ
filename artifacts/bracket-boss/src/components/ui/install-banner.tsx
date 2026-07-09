import { Share, Plus, X } from "lucide-react";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

export function InstallBanner() {
  const { shouldShow, platform, dismiss, triggerInstall, deferredPrompt } = useInstallPrompt();

  if (!shouldShow) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-safe">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <img
            src={`${import.meta.env.BASE_URL}logo.svg`}
            alt="PB&J"
            className="w-12 h-12 rounded-xl shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-white">Install PB&amp;J</p>
            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              Add to your home screen for one-tap access to tournaments, rankings, and open play.
            </p>
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors p-1 -mt-1 -mr-1"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {platform === "ios" ? (
          <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">How to install</p>
            <div className="flex items-center gap-3 text-xs text-zinc-300">
              <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
              <span>Tap <Share className="inline w-3 h-3 mb-0.5" /> <strong>Share</strong> in Safari</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-300">
              <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
              <span>Tap <strong>"Add to Home Screen"</strong></span>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-300">
              <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
              <span>Tap <Plus className="inline w-3 h-3 mb-0.5" /> <strong>Add</strong></span>
            </div>
          </div>
        ) : (
          <div className="border-t border-zinc-800 px-4 py-3">
            {deferredPrompt ? (
              <button
                onClick={triggerInstall}
                className="w-full h-10 bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold rounded-xl transition-colors"
              >
                Install App
              </button>
            ) : (
              <p className="text-xs text-zinc-400 text-center py-1">
                Use your browser menu to <strong className="text-zinc-300">Install App</strong>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
