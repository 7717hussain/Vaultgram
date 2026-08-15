import React from "react";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { QrLoginTab } from "./qr-login-tab";
import { PhoneLoginTab } from "./phone-login-tab";
import { SessionImportTab } from "./session-import-tab";
import { HardDrive, QrCode, Phone, KeyRound } from "lucide-react";

export const AuthPortal: React.FC = () => {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4 bg-zinc-950 selection:bg-zinc-800">
      {/* Subtle radial vignette */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0%,transparent_70%)]" />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[400px] rounded-md border border-zinc-800/60 bg-zinc-900/30 p-6 shadow-2xl backdrop-blur-md"
      >
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2 pb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 border border-zinc-800 text-zinc-200 shadow-sm">
            <HardDrive className="h-4 w-4 stroke-[1.5px]" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100 font-sans">
            Vaultgram
          </h1>
          <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed mt-1">
            Browser-native personal cloud storage powered directly by Telegram's MTProto API over WebSockets.
          </p>
        </div>

        {/* Tab Switcher */}
        <Tabs defaultValue="qr" className="w-full">
          <TabsList>
            <TabsTrigger value="qr">
              <QrCode className="h-3.5 w-3.5 mr-1.5 stroke-[1.5px]" />
              QR Code
            </TabsTrigger>
            <TabsTrigger value="phone">
              <Phone className="h-3.5 w-3.5 mr-1.5 stroke-[1.5px]" />
              Phone OTP
            </TabsTrigger>
            <TabsTrigger value="session">
              <KeyRound className="h-3.5 w-3.5 mr-1.5 stroke-[1.5px]" />
              Session
            </TabsTrigger>
          </TabsList>

          <TabsContent value="qr">
            <QrLoginTab />
          </TabsContent>

          <TabsContent value="phone">
            <PhoneLoginTab />
          </TabsContent>

          <TabsContent value="session">
            <SessionImportTab />
          </TabsContent>
        </Tabs>

        {/* Footer meta badge */}
        <div className="border-t border-zinc-800/50 pt-4 mt-6">
          <div className="font-mono text-[11px] text-zinc-500 tracking-wide text-center flex items-center justify-center gap-2">
            <span>Client-Side</span>
            <span className="text-zinc-700">•</span>
            <span>MTProto WSS</span>
            <span className="text-zinc-700">•</span>
            <span>Zero Backend</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
