// Emergency Native DOM Diagnostic (Runs before any React logic)
window.addEventListener("error", (event) => {
  const root = document.getElementById("root");
  if (root && root.innerHTML.trim() === "") {
    root.innerHTML = `
      <div style="background:#09090b;color:#f43f5e;font-family:monospace;padding:24px;margin:32px auto;max-width:640px;border:1px solid rgba(244,63,94,0.3);border-radius:6px;">
        <h2 style="font-size:16px;margin:0 0 12px;color:#fff;">Pre-Mount Module Crash</h2>
        <div style="font-size:12px;background:#18181b;padding:12px;border-radius:4px;overflow-x:auto;white-space:pre-wrap;">${event.message}</div>
        <div style="font-size:11px;color:#71717a;margin-top:8px;">${event.filename || "unknown"}:${event.lineno || "0"}</div>
        <button onclick="window.location.reload()" style="margin-top:16px;background:#27272a;color:#fff;border:1px solid #3f3f46;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">Reload Application</button>
      </div>
    `;
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const root = document.getElementById("root");
  if (root && root.innerHTML.trim() === "") {
    root.innerHTML = `
      <div style="background:#09090b;color:#f43f5e;font-family:monospace;padding:24px;margin:32px auto;max-width:640px;border:1px solid rgba(244,63,94,0.3);border-radius:6px;">
        <h2 style="font-size:16px;margin:0 0 12px;color:#fff;">Pre-Mount Unhandled Rejection</h2>
        <div style="font-size:12px;background:#18181b;padding:12px;border-radius:4px;overflow-x:auto;white-space:pre-wrap;">${event.reason?.message || event.reason || "Unhandled Promise Rejection"}</div>
        <button onclick="window.location.reload()" style="margin-top:16px;background:#27272a;color:#fff;border:1px solid #3f3f46;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">Reload Application</button>
      </div>
    `;
  }
});


import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ui/error-boundary";
import "./index.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
