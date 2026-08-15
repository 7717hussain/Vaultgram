import { get, set, del } from "idb-keyval";
import { DriveFile } from "./indexer";

// Canonical Key Constants (with fallback lookups for maximum resilience)
const KEY_SESSION = "vaultgram_session_string";
const KEY_SESSION_ALT = "vaultgram_session";
const KEY_USER = "vaultgram_user_profile";
const KEY_USER_ALT = "vaultgram_user";
const KEY_CONFIG = "vaultgram_tg_config";
const KEY_SELECTED_CHANNELS = "vaultgram_selected_channels";
const KEY_CUSTOM_FOLDERS = "vaultgram_custom_folders";
const PREFIX_CHANNEL_FILES = "vaultgram_files_ch_";

export const DEFAULT_TELEGRAM_API_ID = 2040;
export const DEFAULT_TELEGRAM_API_HASH = "b18441a1ff607e10a989891a5462e627";

export interface TelegramConfig {
  apiId: number;
  apiHash: string;
}

export interface TelegramUserProfile {
  id: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
}

export interface ChannelMeta {
  id: string;
  title: string;
  username?: string | null;
  unreadCount?: number;
  accessHash?: string;
  avatarUrl?: string;
  isSelf?: boolean;
}

let inMemoryConfig: TelegramConfig | null = null;

export function getTgConfigSync(): TelegramConfig {
  if (inMemoryConfig && inMemoryConfig.apiId && inMemoryConfig.apiHash) {
    return inMemoryConfig;
  }
  const local = localStorage.getItem("tg_stream_config");
  if (local) {
    try {
      const parsed = JSON.parse(local);
      if (parsed && parsed.apiId && parsed.apiHash) {
        inMemoryConfig = parsed;
        return parsed;
      }
    } catch {}
  }
  inMemoryConfig = {
    apiId: DEFAULT_TELEGRAM_API_ID,
    apiHash: DEFAULT_TELEGRAM_API_HASH,
  };
  return inMemoryConfig;
}

export async function getTgConfig(): Promise<TelegramConfig> {
  const sync = getTgConfigSync();
  try {
    const config = await get<TelegramConfig>(KEY_CONFIG);
    if (config && config.apiId && config.apiHash) {
      inMemoryConfig = config;
      return config;
    }
  } catch {}
  return sync;
}

export async function saveTgConfig(apiId: number | string, apiHash: string): Promise<void> {
  const cfg: TelegramConfig = {
    apiId: typeof apiId === "string" ? parseInt(apiId, 10) || DEFAULT_TELEGRAM_API_ID : apiId,
    apiHash: (apiHash || DEFAULT_TELEGRAM_API_HASH).trim(),
  };
  inMemoryConfig = cfg;
  await set(KEY_CONFIG, cfg);
  localStorage.setItem("tg_stream_config", JSON.stringify(cfg));
}

export async function getSavedSession(): Promise<string> {
  try {
    // Check primary key
    const session = await get<string>(KEY_SESSION);
    if (session && typeof session === "string" && session.trim().length > 10) {
      return session.trim();
    }
    // Check alt key
    const sessionAlt = await get<string>(KEY_SESSION_ALT);
    if (sessionAlt && typeof sessionAlt === "string" && sessionAlt.trim().length > 10) {
      await set(KEY_SESSION, sessionAlt.trim());
      return sessionAlt.trim();
    }
  } catch (e) {
    console.error("IndexedDB getSavedSession error:", e);
  }

  // Fallback to localStorage
  const local = localStorage.getItem("tg_stream_session") || localStorage.getItem("vaultgram_session");
  if (local && local.trim().length > 10) {
    await setSavedSession(local.trim());
    return local.trim();
  }
  return "";
}

export async function setSavedSession(sessionString: string): Promise<void> {
  if (!sessionString || typeof sessionString !== "string" || sessionString.trim().length < 10) {
    console.warn("[SessionGuard] Refusing to persist invalid or empty session string.");
    return;
  }
  const clean = sessionString.trim();
  await set(KEY_SESSION, clean);
  await set(KEY_SESSION_ALT, clean);
  localStorage.setItem("vaultgram_session", clean);
}

export async function clearSavedSession(): Promise<void> {
  await del(KEY_SESSION);
  await del(KEY_SESSION_ALT);
  await del(KEY_USER);
  await del(KEY_USER_ALT);
  await del(KEY_SELECTED_CHANNELS);
  await del(KEY_CUSTOM_FOLDERS);
  localStorage.removeItem("tg_stream_session");
  localStorage.removeItem("vaultgram_session");
  localStorage.removeItem("televault_selected_channels");
  localStorage.removeItem("televault_custom_folders");
  localStorage.removeItem("televault_pinned_ids");
  localStorage.removeItem("televault_favorite_ids");
}

export async function getSavedUserProfile(): Promise<TelegramUserProfile | null> {
  try {
    const user = (await get<TelegramUserProfile>(KEY_USER)) || (await get<TelegramUserProfile>(KEY_USER_ALT));
    return user || null;
  } catch {
    return null;
  }
}

export async function setSavedUserProfile(profile: any): Promise<void> {
  if (profile) {
    const cleanProfile: TelegramUserProfile = {
      id: String(profile.id || ""),
      firstName: profile.firstName || profile.first_name || "",
      lastName: profile.lastName || profile.last_name || "",
      username: profile.username || "",
      phone: profile.phone || "",
    };
    await set(KEY_USER, cleanProfile);
    await set(KEY_USER_ALT, cleanProfile);
  }
}

export async function getSavedSelectedChannels(): Promise<ChannelMeta[]> {
  try {
    const channels = await get<ChannelMeta[]>(KEY_SELECTED_CHANNELS);
    if (channels && Array.isArray(channels)) {
      return channels;
    }
  } catch (e) {
    console.error("Error loading selected channels from IndexedDB:", e);
  }
  return [];
}

export async function saveSelectedChannelsToDb(channels: ChannelMeta[]): Promise<void> {
  try {
    await set(KEY_SELECTED_CHANNELS, channels);
  } catch (e) {
    console.error("Error saving selected channels to IndexedDB:", e);
  }
}

// -------------------------------------------------------------
// Channel File Index Storage (Scalable 10k+ Files per Channel)
// -------------------------------------------------------------

export async function getChannelFilesFromDb(channelId: string): Promise<DriveFile[]> {
  try {
    const files = await get<DriveFile[]>(`${PREFIX_CHANNEL_FILES}${channelId}`);
    return files || [];
  } catch (e) {
    console.error(`Error loading cached files for channel ${channelId} from DB:`, e);
    return [];
  }
}

export async function saveChannelFilesToDb(channelId: string, files: DriveFile[]): Promise<void> {
  try {
    await set(`${PREFIX_CHANNEL_FILES}${channelId}`, files);
  } catch (e) {
    console.error(`Error saving cached files for channel ${channelId} to DB:`, e);
  }
}

export async function appendChannelFilesBatchToDb(channelId: string, newBatch: DriveFile[]): Promise<DriveFile[]> {
  try {
    const current = await getChannelFilesFromDb(channelId);
    const map = new Map<string, DriveFile>();
    
    for (const f of current) {
      map.set(f.id, f);
    }
    for (const f of newBatch) {
      map.set(f.id, f);
    }

    const updated = Array.from(map.values()).sort((a, b) => b.date - a.date);
    await set(`${PREFIX_CHANNEL_FILES}${channelId}`, updated);
    return updated;
  } catch (e) {
    console.error(`Error batch saving files for channel ${channelId}:`, e);
    return newBatch;
  }
}
