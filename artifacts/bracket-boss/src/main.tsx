import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

setBaseUrl(
  import.meta.env.VITE_API_URL || window.location.origin
);

function hideBootSplash() {
  const splash = document.getElementById("app-splash");
  if (!splash) return;

  splash.classList.add("is-hidden");
  window.setTimeout(() => splash.remove(), 260);
}

async function disableServiceWorkersForStability() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    // Best-effort cleanup only.
  }

  if (!("caches" in window)) return;

  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    // Best-effort cleanup only.
  }
}

createRoot(document.getElementById("root")!).render(<App />);

requestAnimationFrame(hideBootSplash);

const scheduleAfterPaint =
  "requestIdleCallback" in window
    ? (cb: () => void) => (window as any).requestIdleCallback(cb, { timeout: 1500 })
    : (cb: () => void) => window.setTimeout(cb, 200);

scheduleAfterPaint(() => {
  void disableServiceWorkersForStability();
});
