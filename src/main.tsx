import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Service Worker for streaming media chunk interception
async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    } catch (e) {
      console.warn("SW Registration:", e);
    }
  }
}

registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
