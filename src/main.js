import { App } from "./ui/app.js";
import { setupServiceWorkerBridge } from "./telegram/swBridge.js";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/sidebar.css";
import "./styles/player.css";
import "./styles/auth.css";
import "./styles/animations.css";

// 1. Register Service Worker for MTProto Stream Interception
async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      console.log("Service Worker registered successfully with scope:", registration.scope);
    } catch (err) {
      console.error("Service Worker registration failed:", err);
    }
  }
}

// 2. Start Application
document.addEventListener("DOMContentLoaded", async () => {
  await registerServiceWorker();
  setupServiceWorkerBridge();

  const appRoot = document.getElementById("app");
  if (appRoot) {
    new App(appRoot);
  }
});
