import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";
import { registerSW } from "virtual:pwa-register";
import { installAuthTrace } from "@/lib/auth-trace";

installAuthTrace();

setBaseUrl(
  import.meta.env.VITE_API_URL || window.location.origin
);

function hideBootSplash() {
  const splash = document.getElementById("app-splash");
  if (!splash) return;

  splash.classList.add("is-hidden");
  window.setTimeout(() => splash.remove(), 260);
}

function setupPwaUpdateHandling() {
  if (!("serviceWorker" in navigator)) return;

  const hasReloadedForPwaUpdate = sessionStorage.getItem("pbj-pwa-updated") === "1";
  const isAuthOrOnboardingRoute = () => {
    const path = window.location.pathname;
    return path.includes("/sign-in") || path.includes("/sign-up") || path.includes("/onboarding/skill");
  };

  const registerServiceWorker = () => {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        if (hasReloadedForPwaUpdate) return;
        // Never force a hard reload; it can interrupt auth flows on Safari.
        sessionStorage.setItem("pbj-pwa-updated", "1");
      },
      onOfflineReady() {
        // No-op: app already shows install/offline affordances.
      },
    });
  };

  const unregisterExistingServiceWorkers = async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch {
      // Best-effort cleanup only.
    }
  };

  if (!isAuthOrOnboardingRoute()) {
    registerServiceWorker();
    return;
  }

  // On auth routes, remove any existing SW controller to avoid legacy refresh behavior.
  void unregisterExistingServiceWorkers();

  const waitForPostAuthRoute = window.setInterval(() => {
    if (!isAuthOrOnboardingRoute()) {
      window.clearInterval(waitForPostAuthRoute);
      registerServiceWorker();
    }
  }, 400);

  window.addEventListener("pagehide", () => window.clearInterval(waitForPostAuthRoute), { once: true });
}

createRoot(document.getElementById("root")!).render(<App />);

requestAnimationFrame(hideBootSplash);

const scheduleAfterPaint =
  "requestIdleCallback" in window
    ? (cb: () => void) => (window as any).requestIdleCallback(cb, { timeout: 1500 })
    : (cb: () => void) => window.setTimeout(cb, 200);

scheduleAfterPaint(setupPwaUpdateHandling);
