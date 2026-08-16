import React, { useState } from "react";
import { tgStreamClient } from "@/lib/telegram/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Phone, KeyRound, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const PhoneLoginTab: React.FC = () => {
  const { phoneStep, setPhoneStep, phoneNumber, setUser } = useAuthStore();

  const [phone, setPhone] = useState(phoneNumber || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.trim();
    if (!cleanPhone || !cleanPhone.startsWith("+")) {
      toast.error("Please enter a valid phone number with country code (e.g. +1234567890)");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await tgStreamClient.sendCode(cleanPhone);
      useAuthStore.setState({ phoneNumber: cleanPhone, phoneCodeHash: res.phoneCodeHash });
      setPhoneStep("otp");
      toast.success("Verification code sent to your Telegram app / SMS.");
    } catch (err: any) {
      toast.error(err.message || "Failed to send verification code.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim();
    if (!cleanCode) {
      toast.error("Please enter the verification code.");
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await tgStreamClient.signIn(cleanCode);
      toast.success(`Connected as ${user.firstName || "Telegram User"}`);
      setUser(user);
    } catch (err: any) {
      if (err.message && err.message.includes("SESSION_PASSWORD_NEEDED")) {
        setPhoneStep("2fa");
        toast.info("Account is protected by 2FA. Please enter your Cloud Password.");
      } else {
        toast.error(err.message || "Invalid verification code.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPassword = String(password || "").trim();
    if (!cleanPassword) {
      toast.error("Please enter your 2FA password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await tgStreamClient.signInWithPassword(cleanPassword);
      toast.success(`Connected as ${user.firstName || "Telegram User"}`);
      setUser(user);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "Incorrect 2FA password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="py-1">
      {phoneStep === "phone" && (
        <form onSubmit={handleSendCode} className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400">
              Phone Number (International Format)
            </label>
            <div className="relative">
              <Phone className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500 stroke-[1.5px]" />
              <Input
                type="tel"
                placeholder="+1 234 567 8900"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
                disabled={isSubmitting}
                className="pl-8 bg-zinc-950/70 border-zinc-800/80 rounded-md text-xs"
              />
            </div>
          </div>

          <Button type="submit" className="w-full gap-2 rounded-md" disabled={isSubmitting}>
            {isSubmitting ? "Sending Code..." : "Send Verification Code"}
            <ArrowRight className="h-3.5 w-3.5 stroke-[1.75px]" />
          </Button>
        </form>
      )}

      {phoneStep === "otp" && (
        <form onSubmit={handleVerifyOtp} className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400">
              Verification Code (Sent to {useAuthStore.getState().phoneNumber})
            </label>
            <div className="relative">
              <KeyRound className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500 stroke-[1.5px]" />
              <Input
                type="text"
                placeholder="12345"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                disabled={isSubmitting}
                className="pl-8 tracking-widest font-mono text-center bg-zinc-950/70 border-zinc-800/80 rounded-md text-xs"
              />
            </div>
          </div>

          <Button type="submit" className="w-full gap-2 rounded-md" disabled={isSubmitting}>
            {isSubmitting ? "Verifying..." : "Verify & Sign In"}
            <ArrowRight className="h-3.5 w-3.5 stroke-[1.75px]" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPhoneStep("phone")}
            disabled={isSubmitting}
            className="w-full gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-sm"
          >
            <ArrowLeft className="h-3 w-3 stroke-[1.5px]" />
            Change Phone Number
          </Button>
        </form>
      )}

      {phoneStep === "2fa" && (
        <form onSubmit={handleVerify2FA} className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400">
              Two-Step Cloud Password
            </label>
            <Input
              type="password"
              placeholder="Enter your 2FA password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              disabled={isSubmitting}
              className="bg-zinc-950/70 border-zinc-800/80 rounded-md text-xs"
            />
          </div>

          <Button type="submit" className="w-full gap-2 rounded-md" disabled={isSubmitting}>
            {isSubmitting ? "Authenticating..." : "Confirm & Connect"}
            <ArrowRight className="h-3.5 w-3.5 stroke-[1.75px]" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPhoneStep("otp")}
            disabled={isSubmitting}
            className="w-full gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-sm"
          >
            <ArrowLeft className="h-3 w-3 stroke-[1.5px]" />
            Back to OTP Code
          </Button>
        </form>
      )}
    </div>
  );
};
