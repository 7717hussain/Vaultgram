import { Api } from "telegram";
import { tgStreamClient } from "./client";
import { get, set } from "idb-keyval";

export const VAULTGRAM_SYSTEM_TAG = "[VAULTGRAM_CONFIG_V1]";
export const SYSTEM_CHANNEL_TITLE = "Vaultgram Vault (Do Not Delete)";
export const SYSTEM_CHANNEL_ABOUT = `${VAULTGRAM_SYSTEM_TAG} System metadata and cloud configuration storage for Vaultgram Drive.`;

const KEY_CONFIG_CHANNEL_ID = "vaultgram_config_channel_id";
const KEY_CONFIG_MESSAGE_ID = "vaultgram_config_msg_id";

export interface VaultgramCloudConfig {
  version: 1;
  lastUpdated: number; // Unix timestamp
  selectedChannelIds: string[];
  pinnedFileIds: string[];
  favoriteFileIds: string[];
  customFolders: {
    id: string;
    name: string;
    fileIds: string[];
    createdAt?: number;
  }[];
  preferences: {
    defaultViewMode: "GRID" | "LIST";
    sortBy: "DATE_DESC" | "DATE_ASC" | "SIZE_DESC" | "NAME_ASC";
  };
}

export class TelegramSyncStore {
  private configChannelEntity: any = null;
  private configMessageId: number | null = null;
  private syncDebounceTimer: any = null;
  private isWriting = false;
  private pendingPayload: VaultgramCloudConfig | null = null;
  private initPromise: Promise<{ channelId: string; config: VaultgramCloudConfig | null }> | null = null;

  // --------------------------------------------------------------------------
  // 1. In-Memory Mutex & Sequential Idempotency Lock
  // --------------------------------------------------------------------------
  async initSystemChannel(): Promise<{ channelId: string; config: VaultgramCloudConfig | null }> {
    if (this.initPromise) {
      console.log("[Sync] Initialization already in progress, returning existing promise.");
      return this.initPromise;
    }

    this.initPromise = this.performSyncBootstrap().finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  private async performSyncBootstrap(): Promise<{ channelId: string; config: VaultgramCloudConfig | null }> {
    try {
      if (!tgStreamClient.client || !tgStreamClient.isConnected) {
        return { channelId: "", config: null };
      }

      const client = tgStreamClient.client;
      let targetChannel: any = null;
      let cachedChId = await get<string>(KEY_CONFIG_CHANNEL_ID);
      let cachedMsgId = await get<number>(KEY_CONFIG_MESSAGE_ID);

      // =========================================================================
      // STEP 1: Check Local IndexedDB First
      // =========================================================================
      if (cachedChId) {
        try {
          const entity = await client.getEntity(parseInt(cachedChId, 10));
          if (entity) {
            console.log(`[Sync] Found existing config channel from IndexedDB: ${cachedChId}`);
            targetChannel = entity;
          }
        } catch {
          console.warn("[Sync] Cached config channel ID invalid or inaccessible, checking dialogs...");
          targetChannel = null;
        }
      }

      // =========================================================================
      // STEP 2: Scan Existing Dialogs for Tag & Title (Handle Existing Duplicates)
      // =========================================================================
      if (!targetChannel) {
        try {
          const dialogs = await client.getDialogs({ limit: 100 });
          const matchingChannels: any[] = [];

          for (const d of dialogs) {
            if (d.isChannel && d.entity) {
              const entity = d.entity;
              const title = entity.title || d.title || "";

              // Fast check on title first
              if (title.trim() === SYSTEM_CHANNEL_TITLE) {
                matchingChannels.push(entity);
                continue;
              }

              // Deep check on description/about if title doesn't match
              try {
                const fullChannel: any = await client.invoke(
                  new Api.channels.GetFullChannel({ channel: entity })
                );
                const about = fullChannel?.fullChat?.about || "";
                if (about.includes(VAULTGRAM_SYSTEM_TAG)) {
                  matchingChannels.push(entity);
                }
              } catch {
                // Ignore per-channel access errors
              }
            }
          }

          if (matchingChannels.length > 0) {
            if (matchingChannels.length > 1) {
              console.log(
                `[Sync] Multiple config channels detected (count: ${matchingChannels.length}). Binding to: ${matchingChannels[0].id}`
              );
            } else {
              console.log(`[Sync] Found existing config channel in dialogs: ${matchingChannels[0].id}`);
            }

            // Pick the first discovered matching channel
            targetChannel = matchingChannels[0];
            cachedChId = String(targetChannel.id);
            await set(KEY_CONFIG_CHANNEL_ID, cachedChId);
          }
        } catch (err) {
          console.warn("[Sync] Non-fatal notice during dialog scan:", err);
        }
      }

      // =========================================================================
      // STEP 3: Create Channel ONLY if 0 Matches Exist
      // =========================================================================
      if (!targetChannel) {
        try {
          console.log("[Sync] No channel found. Creating new system channel...");
          const result: any = await client.invoke(
            new Api.channels.CreateChannel({
              title: SYSTEM_CHANNEL_TITLE,
              about: SYSTEM_CHANNEL_ABOUT,
              broadcast: true,
              megagroup: false,
            })
          );

          const createdChat = result.chats && result.chats[0];
          if (createdChat) {
            targetChannel = createdChat;
            cachedChId = String(createdChat.id);
            // Immediately persist before sending or pinning
            await set(KEY_CONFIG_CHANNEL_ID, cachedChId);
            console.log(`[Sync] Created system channel: ${cachedChId}`);
          }
        } catch (err) {
          console.warn("[Sync] Non-fatal notice creating system channel:", err);
        }
      }

      this.configChannelEntity = targetChannel;

      if (!targetChannel) {
        return { channelId: "", config: null };
      }

      // --------------------------------------------------------------------------
      // 2. Fetch Pinned Config Message
      // --------------------------------------------------------------------------
      let remoteConfig: VaultgramCloudConfig | null = null;

      try {
        const full: any = await client.invoke(
          new Api.channels.GetFullChannel({ channel: targetChannel })
        );
        const pinnedMsgId = full?.fullChat?.pinnedMsgId || cachedMsgId;

        if (pinnedMsgId) {
          const messages: any = await client.getMessages(targetChannel, {
            ids: [pinnedMsgId],
          });

          if (messages && messages[0] && messages[0].message) {
            const rawText = messages[0].message;
            if (rawText.includes("```json")) {
              const jsonStr = rawText.split("```json")[1].split("```")[0].trim();
              remoteConfig = JSON.parse(jsonStr);
            } else {
              remoteConfig = JSON.parse(rawText);
            }
            this.configMessageId = pinnedMsgId;
            await set(KEY_CONFIG_MESSAGE_ID, pinnedMsgId);
          }
        }
      } catch (err) {
        console.warn("[Sync] Non-fatal notice reading pinned config message:", err);
      }

      return {
        channelId: String(targetChannel.id),
        config: remoteConfig,
      };
    } catch (globalErr) {
      console.warn("[Sync] Cloud sync initialization caught error (fallback to local):", globalErr);
      return { channelId: "", config: null };
    }
  }

  // --------------------------------------------------------------------------
  // 3. Debounced Cloud Write Flow (Optimistic + 3s Coalesce)
  // --------------------------------------------------------------------------
  queueCloudSync(config: VaultgramCloudConfig) {
    this.pendingPayload = config;

    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }

    this.syncDebounceTimer = setTimeout(() => {
      this.executeCloudWrite();
    }, 3000);
  }

  private async executeCloudWrite() {
    if (!this.pendingPayload || this.isWriting) return;
    if (!this.configChannelEntity || !tgStreamClient.client) return;

    this.isWriting = true;
    const payload = { ...this.pendingPayload, lastUpdated: Math.floor(Date.now() / 1000) };

    const formattedMessage = [
      `🔐 **Vaultgram Cloud Configuration**`,
      `Last synced: ${new Date().toISOString()}`,
      ``,
      "```json",
      JSON.stringify(payload, null, 2),
      "```",
    ].join("\n");

    try {
      const client = tgStreamClient.client;

      if (this.configMessageId) {
        await client.editMessage(this.configChannelEntity, {
          message: this.configMessageId,
          text: formattedMessage,
          parseMode: "md",
        });
      } else {
        const sent: any = await client.sendMessage(this.configChannelEntity, {
          message: formattedMessage,
          parseMode: "md",
        });

        if (sent && sent.id) {
          this.configMessageId = sent.id;
          await set(KEY_CONFIG_MESSAGE_ID, sent.id);

          await client.pinMessage(this.configChannelEntity, sent.id, {
            notify: false,
          });
        }
      }
      console.log("[Sync] Cloud configuration synced to Telegram Vault successfully.");
    } catch (err: any) {
      console.warn("[Sync] Re-posting new pin for cloud configuration...", err);
      try {
        const client = tgStreamClient.client;
        const sent: any = await client.sendMessage(this.configChannelEntity, {
          message: formattedMessage,
          parseMode: "md",
        });
        if (sent && sent.id) {
          this.configMessageId = sent.id;
          await set(KEY_CONFIG_MESSAGE_ID, sent.id);
          await client.pinMessage(this.configChannelEntity, sent.id, { notify: false });
        }
      } catch (postErr) {
        console.warn("[Sync] Background write error (retaining local state):", postErr);
      }
    } finally {
      this.isWriting = false;
    }
  }
}

export const telegramSyncStore = new TelegramSyncStore();
