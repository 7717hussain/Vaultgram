import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck } from "lucide-react";

interface TwoFaDialogProps {
  isOpen: boolean;
  hint?: string;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export const TwoFaDialog: React.FC<TwoFaDialogProps> = ({
  isOpen,
  hint,
  onSubmit,
  onCancel,
}) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please enter your 2FA password.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    onSubmit(password);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[380px] border-zinc-800 bg-zinc-950 p-5 rounded-md">
        <DialogHeader className="space-y-2 text-center sm:text-center">
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-md bg-zinc-900 border border-zinc-800 text-zinc-200 shadow-sm">
            <ShieldCheck className="h-4 w-4 stroke-[1.5px]" />
          </div>
          <DialogTitle className="text-sm font-semibold tracking-tight text-zinc-100">
            Two-Step Verification
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            {hint ? (
              <span>
                Account is protected with a cloud password. Hint:{" "}
                <span className="font-medium text-zinc-200">{hint}</span>
              </span>
            ) : (
              "Please enter your Telegram Cloud Password to proceed."
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          {error && (
            <div className="rounded-sm bg-red-950/40 border border-red-900/60 px-2.5 py-1.5 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <Input
              type="password"
              placeholder="Enter cloud password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              disabled={isSubmitting}
              className="bg-zinc-900/60 border-zinc-800 text-xs rounded-sm"
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={isSubmitting}
              className="text-xs rounded-sm h-8"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="text-xs rounded-sm h-8"
            >
              {isSubmitting ? "Verifying..." : "Confirm & Sign In"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
