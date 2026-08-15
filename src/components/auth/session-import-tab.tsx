import React, { useState } from "react";
import { tgStreamClient } from "@/lib/telegram/client";
import { setSavedSession, saveTgConfig } from "@/lib/telegram/session";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Key, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const SessionImportTab: React.FC = () => {
  const { setUser } = useAuthStore();

  const [sessionString, setSessionString] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customApiId, setCustomApiId] = useState("");
  const [customApiHash, setCustomApiHash] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSession = sessionString.trim();
    if (!cleanSession) {
      toast.error("Please enter a valid GramJS session string.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (customApiId.trim() && customApiHash.trim()) {
        await saveTgConfig(customApiId.trim(), customApiHash.trim());
      }

      await setSavedSession(cleanSession);
      const ok = await tgStreamClient.init();
      if (ok && tgStreamClient.user) {
        toast.success(`Connected as ${tgStreamClient.user.firstName || "Telegram User"}`);
        setUser(tgStreamClient.user);
      } else {
        toast.error("Session string is expired or invalid.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to validate session string.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleImport} className="space-y-3 py-1">
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-zinc-400">
          GramJS StringSession
        </label>
        <textarea
          rows={3}
          placeholder="1BJWap1wB..."
          value={sessionString}
          onChange={(e) => setSessionString(e.target.value)}
          disabled={isSubmitting}
          className="w-full bg-zinc-950/70 border border-zinc-800/80 rounded-md p-2.5 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-zinc-600 focus-visible:border-zinc-600 transition-all resize-none"
        />
      </div>

      <div className="border border-zinc-800/60 bg-zinc-950/40 rounded-md overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full text-xs font-medium text-zinc-400 hover:text-zinc-200 px-3 py-2.5 flex justify-between items-center transition-colors"
        >
          <span>Override API ID & Hash (Optional)</span>
          {showAdvanced ? (
            <ChevronUp className="h-3.5 w-3.5 text-zinc-500 stroke-[1.5px]" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500 stroke-[1.5px]" />
          )}
        </button>

        {showAdvanced && (
          <div className="space-y-2 p-3 pt-1 border-t border-zinc-800/50 bg-zinc-950/60">
            <Input
              type="text"
              placeholder="Custom API ID (e.g. 2040)"
              value={customApiId}
              onChange={(e) => setCustomApiId(e.target.value)}
              className="bg-zinc-900/60 border-zinc-800 rounded-sm h-8 px-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-700"
            />
            <Input
              type="text"
              placeholder="Custom API Hash"
              value={customApiHash}
              onChange={(e) => setCustomApiHash(e.target.value)}
              className="bg-zinc-900/60 border-zinc-800 rounded-sm h-8 px-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-700"
            />
          </div>
        )}
      </div>

      <Button type="submit" className="w-full gap-2 rounded-md" disabled={isSubmitting}>
        <Key className="h-3.5 w-3.5 stroke-[1.75px]" />
        {isSubmitting ? "Connecting to MTProto..." : "Import & Connect"}
        <ArrowRight className="h-3.5 w-3.5 stroke-[1.75px]" />
      </Button>
    </form>
  );
};
