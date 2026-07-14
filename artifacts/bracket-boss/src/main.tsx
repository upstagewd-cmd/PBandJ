import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";
import { registerSW } from "virtual:pwa-register";

setBaseUrl(
  import.meta.env.VITE_API_URL || window.location.origin
);

// Ensure users get fresh builds quickly while avoiding reload loops.
if ("serviceWorker" in navigator) {
  const hasReloadedForPwaUpdate = sessionStorage.getItem("pbj-pwa-updated") === "1";

  registerSW({
    immediate: true,
    onNeedRefresh() {
      if (hasReloadedForPwaUpdate) return;
      sessionStorage.setItem("pbj-pwa-updated", "1");
      window.location.reload();
    },
    onOfflineReady() {
      // No-op: app already shows install/offline affordances.
    },
  });
}

createRoot(document.getElementById("root")!).render(<App />);
