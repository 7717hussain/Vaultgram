import { create } from "zustand";
import {
  getSavedSession,
  getSavedUserProfile,
  clearSavedSession,
  TelegramUserProfile,
} from "../telegram/session";
import { tgStreamClient } from "../telegram/client";

export type AuthBootStatus = "BOOTING" | "AUTHENTICATED" | "UNAUTHENTICATED";
export type AuthStage = "idle" | "qr" | "phone" | "otp" | "2fa" | "session" | "authorized";

interface AuthState {
  bootStatus: AuthBootStatus;
  isConnected: boolean;
  isConnecting: boolean;
  user: TelegramUserProfile | null;
  authStage: AuthStage;
  phoneStep: "phone" | "otp" | "2fa";
  phoneNumber: string;
  phoneCodeHash: string | null;

  // Actions
  init: () => Promise<boolean>;
  setAuthStage: (stage: AuthStage) => void;
  setPhoneStep: (step: "phone" | "otp" | "2fa") => void;
  setUser: (user: TelegramUserProfile | null) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  bootStatus: "BOOTING",
  isConnected: false,
  isConnecting: false,
  user: null,
  authStage: "idle",
  phoneStep: "phone",
  phoneNumber: "",
  phoneCodeHash: null,

  init: async () => {
    set({ isConnecting: true, bootStatus: "BOOTING" });

    try {
      const session = await getSavedSession();
      if (!session) {
        set({
          isConnecting: false,
          isConnected: false,
          user: null,
          authStage: "qr",
          bootStatus: "UNAUTHENTICATED",
        });
        return false;
      }

      // Check cached user profile first for instant UI response
      const cachedUser = await getSavedUserProfile();
      if (cachedUser) {
        set({ user: cachedUser });
      }

      const isConnected = await tgStreamClient.init();
      if (isConnected && tgStreamClient.user) {
        set({
          isConnected: true,
          isConnecting: false,
          user: tgStreamClient.user,
          authStage: "authorized",
          bootStatus: "AUTHENTICATED",
        });
        return true;
      }
    } catch (e) {
      console.error("[useAuthStore] Auto-login bootstrap error:", e);
    }

    set({
      isConnecting: false,
      isConnected: false,
      authStage: "qr",
      bootStatus: "UNAUTHENTICATED",
    });
    return false;
  },

  setAuthStage: (stage) => set({ authStage: stage }),
  setPhoneStep: (step) => set({ phoneStep: step }),
  setUser: (user) =>
    set({
      user,
      isConnected: !!user,
      authStage: user ? "authorized" : "qr",
      bootStatus: user ? "AUTHENTICATED" : "UNAUTHENTICATED",
    }),

  logout: async () => {
    await tgStreamClient.destroy();
    await clearSavedSession();
    set({
      bootStatus: "UNAUTHENTICATED",
      isConnected: false,
      isConnecting: false,
      user: null,
      authStage: "qr",
      phoneNumber: "",
      phoneCodeHash: null,
    });
  },
}));
