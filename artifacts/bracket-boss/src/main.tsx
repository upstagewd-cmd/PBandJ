import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";
import { registerSW } from "virtual:pwa-register";

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

  registerSW({
    immediate: true,
    onNeedRefresh() {
      if (hasReloadedForPwaUpdate) return;
      // Avoid disrupting signup/signin and onboarding with an automatic refresh.
      if (isAuthOrOnboardingRoute()) return;
      sessionStorage.setItem("pbj-pwa-updated", "1");
      window.location.reload();
    },
    onOfflineReady() {
      // No-op: app already shows install/offline affordances.
    },
  });
}

createRoot(document.getElementById("root")!).render(<App />);

requestAnimationFrame(hideBootSplash);

const scheduleAfterPaint =
  "requestIdleCallback" in window
    ? (cb: () => void) => (window as any).requestIdleCallback(cb, { timeout: 1500 })
    : (cb: () => void) => window.setTimeout(cb, 200);

scheduleAfterPaint(setupPwaUpdateHandling);
