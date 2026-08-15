import React, { useEffect, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";
import { tgStreamClient } from "@/lib/telegram/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { RefreshCw, Smartphone } from "lucide-react";
import { TwoFaDialog } from "./two-fa-dialog";
import { toast } from "sonner";

export const QrLoginTab: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [is2FaOpen, setIs2FaOpen] = useState(false);
  const [twoFaHint, setTwoFaHint] = useState<string | undefined>();
  const [twoFaResolver, setTwoFaResolver] = useState<((pwd: string) => void) | null>(null);

  const { setUser } = useAuthStore();

  const handleStartQr = useCallback(async () => {
    setIsLoading(true);

    try {
      const result = await tgStreamClient.startQrLogin(
        (url) => {
          if (canvasRef.current) {
            QRCode.toCanvas(canvasRef.current, url, {
              width: 176,
              margin: 1,
              color: {
                dark: "#f4f4f5",
                light: "#09090b",
              },
            });
            setIsLoading(false);
          }
        },
        async (hint) => {
          setTwoFaHint(hint);
          setIs2FaOpen(true);
          return new Promise<string>((resolve) => {
            setTwoFaResolver(() => resolve);
          });
        }
      );

      toast.success(`Connected as ${result.user.firstName || "Telegram User"}`);
      setUser(result.user);
    } catch (err: any) {
      console.error("QR Login failed:", err);
      setIsLoading(false);
      toast.error(err.message || "Failed to establish Telegram connection.");
    }
  }, [setUser]);

  useEffect(() => {
    handleStartQr();
  }, [handleStartQr]);

  const handleTwoFaSubmit = (pass: string) => {
    setIs2FaOpen(false);
    if (twoFaResolver) {
      twoFaResolver(pass);
      setTwoFaResolver(null);
    }
  };

  const handleTwoFaCancel = () => {
    setIs2FaOpen(false);
    if (twoFaResolver) {
      twoFaResolver("");
      setTwoFaResolver(null);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3.5 py-1">
      <div className="relative flex h-[196px] w-[196px] items-center justify-center rounded-md border border-zinc-800/80 bg-zinc-950 p-2 shadow-inner">
        <canvas
          ref={canvasRef}
          className={`rounded-sm transition-opacity duration-200 ${
            isLoading ? "opacity-0" : "opacity-100"
          }`}
        />
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500">
            <div className="h-5 w-5 animate-spin rounded-sm border border-zinc-500 border-t-zinc-200" />
            <span className="text-[11px] font-mono tracking-tight text-zinc-400">Connecting MTProto...</span>
          </div>
        )}
      </div>

      <div className="space-y-1 text-center">
        <p className="text-xs font-medium text-zinc-200 flex items-center justify-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5 text-zinc-400 stroke-[1.5px]" />
          Scan with Telegram Mobile
        </p>
        <p className="text-[11px] text-zinc-500">
          Settings → <span className="text-zinc-400">Devices</span> →{" "}
          <span className="text-zinc-400">Link Desktop Device</span>
        </p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleStartQr}
        className="h-7 gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-sm"
      >
        <RefreshCw className="h-3 w-3 stroke-[1.5px]" />
        Regenerate QR
      </Button>

      <TwoFaDialog
        isOpen={is2FaOpen}
        hint={twoFaHint}
        onSubmit={handleTwoFaSubmit}
        onCancel={handleTwoFaCancel}
      />
    </div>
  );
};
