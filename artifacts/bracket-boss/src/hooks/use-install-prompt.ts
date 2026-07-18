import { useState, useEffect } from "react";

const DISMISSED_KEY = "pbj_install_prompt_dismissed";
const INSTALLED_KEY = "pbj_app_installed";
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type Platform = "ios" | "android" | "desktop" | "unknown";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function getPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/Mobi|Android/i.test(ua)) return "android";
  return "desktop";
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIosDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  if (!isIosDevice) return false;

  return !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser/i.test(ua);
}

function isAndroidChrome(): boolean {
  const ua = navigator.userAgent;
  if (!/android/i.test(ua)) return false;

  const isChrome = /Chrome\//i.test(ua) && /Google Inc\./i.test(navigator.vendor);
  const isOtherAndroidBrowser = /EdgA|OPR|SamsungBrowser|Firefox|DuckDuckGo|YaBrowser/i.test(ua);

  return isChrome && !isOtherAndroidBrowser;
}

function supportsInstallPrompt(platform: Platform): boolean {
  if (platform === "ios") return isIosSafari();
  if (platform === "android") return isAndroidChrome();
  return false;
}

function isRunningAsPWA(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    return Date.now() - ts < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

function wasInstalled(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

function markInstalled(): void {
  try {
    localStorage.setItem(INSTALLED_KEY, "1");
  } catch {
    // ignore
  }
}

export function useInstallPrompt() {
  const platform = getPlatform();
  const isSupportedBrowser = supportsInstallPrompt(platform);
  const [isPWA] = useState(() => {
    const pwa = isRunningAsPWA();
    // If already running as a PWA (e.g., iOS standalone launch), persist the
    // installed flag immediately so future browser-tab visits stay suppressed.
    if (pwa) markInstalled();
    return pwa;
  });
  const [dismissed, setDismissed] = useState(() => wasDismissedRecently());
  const [installed, setInstalled] = useState(() => wasInstalled());
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [manuallyTriggered, setManuallyTriggered] = useState(false);
  const [autoShowReady, setAutoShowReady] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      markInstalled();
      setInstalled(true);
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  // Auto-show after 2 seconds on mobile (but not if desktop)
  useEffect(() => {
    if (isSupportedBrowser && !isPWA && !installed && !dismissed) {
      const timer = setTimeout(() => setAutoShowReady(true), 2000);
      return () => clearTimeout(timer);
    }
    return;
  }, [isSupportedBrowser, isPWA, installed, dismissed]);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setDismissed(true);
    setManuallyTriggered(false);
    setAutoShowReady(false);
  };

  const triggerInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      markInstalled();
      setInstalled(true);
    }
    setDeferredPrompt(null);
    setManuallyTriggered(false);
    setAutoShowReady(false);
  };

  const canShowInstallButton = isSupportedBrowser && !isPWA && !installed;

  const shouldShow = canShowInstallButton && ((autoShowReady && !dismissed) || manuallyTriggered);

  const manualShow = () => {
    if (!canShowInstallButton) return;
    setManuallyTriggered(true);
  };

  return {
    shouldShow,
    platform,
    isPWA,
    canShowInstallButton,
    dismiss,
    triggerInstall,
    deferredPrompt,
    manualShow,
  };
}
