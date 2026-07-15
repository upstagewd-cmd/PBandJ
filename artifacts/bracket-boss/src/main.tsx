import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

setBaseUrl(
  import.meta.env.VITE_API_URL || window.location.origin
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      })
      .catch(() => {
        // Ignore SW cleanup failures in this temporary auth-isolation path.
      });
  });
}

function hideBootSplash() {
  const splash = document.getElementById("app-splash");
  if (!splash) return;

  splash.classList.add("is-hidden");
  window.setTimeout(() => splash.remove(), 260);
}

createRoot(document.getElementById("root")!).render(<App />);
requestAnimationFrame(hideBootSplash);
