import { create } from "zustand";
import { ChannelMeta, getSavedSelectedChannels, saveSelectedChannelsToDb } from "../telegram/session";
import { tgStreamClient } from "../telegram/client";

interface ChannelWizardState {
  availableChannels: ChannelMeta[];
  selectedChannelIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  floodWaitSeconds: number;
  isWizardCompleted: boolean;

  // Actions
  fetchChannels: () => Promise<void>;
  toggleChannel: (channelId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  confirmSelection: () => Promise<void>;
  loadSavedSelection: () => Promise<boolean>;
  resetWizard: () => void;
}

export const useChannelWizardStore = create<ChannelWizardState>((set, get) => ({
  availableChannels: [],
  selectedChannelIds: new Set<string>(),
  isLoading: false,
  error: null,
  floodWaitSeconds: 0,
  isWizardCompleted: false,

  loadSavedSelection: async () => {
    try {
      const saved = await getSavedSelectedChannels();
      if (saved && saved.length > 0) {
        set({
          selectedChannelIds: new Set(saved.map((c) => c.id)),
          isWizardCompleted: true,
        });
        return true;
      }
    } catch (e) {
      console.error("Failed to load saved channel selection:", e);
    }
    return false;
  },

  fetchChannels: async () => {
    set({ isLoading: true, error: null });

    try {
      const channels = await tgStreamClient.getUserChannels();
      const currentSelected = get().selectedChannelIds;

      // If no channels were previously selected, default select all
      const newSelected = currentSelected.size > 0
        ? currentSelected
        : new Set(channels.map((c) => c.id));

      set({
        availableChannels: channels,
        selectedChannelIds: newSelected,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      const msg = String(err.message || err);
      if (msg.includes("FLOOD_WAIT_")) {
        const wait = parseInt(msg.match(/FLOOD_WAIT_(\d+)/)?.[1] || "10", 10);
        set({ floodWaitSeconds: wait, isLoading: false });
        
        const timer = setInterval(() => {
          const current = get().floodWaitSeconds;
          if (current <= 1) {
            clearInterval(timer);
            set({ floodWaitSeconds: 0 });
            get().fetchChannels();
          } else {
            set({ floodWaitSeconds: current - 1 });
          }
        }, 1000);
      } else {
        set({ error: err.message || "Failed to discover channels.", isLoading: false });
      }
    }
  },

  toggleChannel: (channelId: string) => {
    const current = new Set(get().selectedChannelIds);
    if (current.has(channelId)) {
      current.delete(channelId);
    } else {
      current.add(channelId);
    }
    set({ selectedChannelIds: current });
  },

  selectAll: () => {
    const allIds = get().availableChannels.map((c) => c.id);
    set({ selectedChannelIds: new Set(allIds) });
  },

  deselectAll: () => {
    set({ selectedChannelIds: new Set() });
  },

  confirmSelection: async () => {
    const { availableChannels, selectedChannelIds } = get();
    const selectedObjects = availableChannels.filter((c) => selectedChannelIds.has(c.id));

    await saveSelectedChannelsToDb(selectedObjects);
    localStorage.setItem("televault_selected_channels", JSON.stringify(Array.from(selectedChannelIds)));

    set({ isWizardCompleted: true });
  },

  resetWizard: () => {
    set({ isWizardCompleted: false });
  },
}));
