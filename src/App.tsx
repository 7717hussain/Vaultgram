import React, { useEffect } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useChannelWizardStore } from "@/lib/stores/channel-wizard-store";
import { useDriveStore } from "@/lib/stores/drive-store";
import { AuthPortal } from "@/components/auth/auth-portal";
import { ChannelWizard } from "@/components/wizard/channel-wizard";
import { Sidebar } from "@/components/layout/sidebar";
import { DriveCanvas } from "@/components/drive/drive-canvas";
import { HardDrive } from "lucide-react";
import { Toaster } from "sonner";

export const App: React.FC = () => {
  const { bootStatus, isConnected, init } = useAuthStore();
  const { isWizardCompleted, loadSavedSelection } = useChannelWizardStore();
  const { initDrive } = useDriveStore();

  // Strictly decoupled bootstrap: auth verification is the single source of truth
  useEffect(() => {
    async function bootstrap() {
      try {
        const isAuthenticated = await init();
        if (isAuthenticated) {
          try {
            const hasSavedChannels = await loadSavedSelection();
            if (hasSavedChannels) {
              // Launch drive in background without blocking or failing auth
              initDrive().catch((err) => {
                console.warn("[App] Background drive init warning (using cache):", err);
              });
            }
          } catch (wizardErr) {
            console.warn("[App] Saved channels check warning:", wizardErr);
          }
        }
      } catch (authErr) {
        console.error("[App] MTProto Auth verification failure:", authErr);
      }
    }
    bootstrap();
  }, [init, loadSavedSelection, initDrive]);

  // When user finishes the wizard in session, trigger drive initialization
  useEffect(() => {
    if (isConnected && isWizardCompleted) {
      initDrive().catch((e) => console.warn("[App] Drive init warning:", e));
    }
  }, [isConnected, isWizardCompleted, initDrive]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-zinc-800">
      <Toaster position="bottom-right" richColors theme="dark" />

      {bootStatus === "BOOTING" ? (
        /* Minimalist Centered Boot Screen */
        <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950">
          <div className="relative flex flex-col items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-900 border border-zinc-800 text-zinc-200 shadow-sm animate-pulse">
              <HardDrive className="h-5 w-5 stroke-[1.5px]" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-zinc-400 animate-ping" />
              <span className="text-xs font-mono tracking-tight text-zinc-400">
                Restoring session...
              </span>
            </div>
          </div>
        </div>
      ) : !isConnected ? (
        /* Stage 1: Auth Portal (Rendered ONLY when confirmed unauthenticated) */
        <AuthPortal />
      ) : !isWizardCompleted ? (
        /* Stage 2: Channel Selection Wizard */
        <ChannelWizard />
      ) : (
        /* Stage 3: Full Drive Workspace */
        <div className="flex h-screen w-screen overflow-hidden">
          <Sidebar />
          <DriveCanvas />
        </div>
      )}
    </div>
  );
};
export default App;
