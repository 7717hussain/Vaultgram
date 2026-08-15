import { get, set, del } from "idb-keyval";
import { DriveFile } from "./indexer";

// Canonical Key Constants (with fallback lookups for maximum resilience)
const KEY_SESSION = "vaultgram_session_string";
const KEY_SESSION_ALT = "vaultgram_session";
const KEY_USER = "vaultgram_user_profile";
const KEY_USER_ALT = "vaultgram_user";
const KEY_CONFIG = "vaultgram_tg_config";
const KEY_SELECTED_CHANNELS = "vaultgram_selected_channels";
const KEY_TRANSFER_TASKS = "vaultgram_transfer_tasks";
const KEY_TRANSFER_CONCURRENCY = "vaultgram_transfer_concurrency";
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
  const cfg = await get<TelegramConfig>(KEY_CONFIG);
  if (cfg && cfg.apiId && cfg.apiHash) {
    inMemoryConfig = cfg;
    return cfg;
  }
  return getTgConfigSync();
}

export async function saveTgConfig(configOrApiId: TelegramConfig | number | string, apiHash?: string): Promise<void> {
  let config: TelegramConfig;
  if (typeof configOrApiId === "object") {
    config = configOrApiId;
  } else {
    config = {
      apiId: Number(configOrApiId),
      apiHash: String(apiHash || ""),
    };
  }
  inMemoryConfig = config;
  localStorage.setItem("tg_stream_config", JSON.stringify(config));
  await set(KEY_CONFIG, config);
}

// -------------------------------------------------------------
// Session & Auth Profile Storage
// -------------------------------------------------------------

export async function getSavedSession(): Promise<string | null> {
  try {
    let session = await get<string>(KEY_SESSION);
    if (!session) {
      session = await get<string>(KEY_SESSION_ALT);
    }
    if (session && typeof session === "string" && session.trim().length > 10) {
      return session.trim();
    }
  } catch (e) {
    console.error("Error reading saved session from IndexedDB:", e);
  }
  return null;
}

export async function saveSession(sessionString: string): Promise<void> {
  if (!sessionString || sessionString.length < 10) {
    console.warn("Attempted to save invalid or empty session string. Ignored.");
    return;
  }
  try {
    await set(KEY_SESSION, sessionString);
    await set(KEY_SESSION_ALT, sessionString);
  } catch (e) {
    console.error("Error writing session to IndexedDB:", e);
  }
}

// Aliases for compatibility
export const setSavedSession = saveSession;

export async function getSavedUserProfile(): Promise<TelegramUserProfile | null> {
  try {
    let user = await get<TelegramUserProfile>(KEY_USER);
    if (!user) {
      user = await get<TelegramUserProfile>(KEY_USER_ALT);
    }
    return user || null;
  } catch (e) {
    console.error("Error reading saved user profile from IndexedDB:", e);
    return null;
  }
}

export async function saveUserProfile(user: TelegramUserProfile): Promise<void> {
  try {
    await set(KEY_USER, user);
    await set(KEY_USER_ALT, user);
  } catch (e) {
    console.error("Error writing user profile to IndexedDB:", e);
  }
}

// Aliases for compatibility
export const setSavedUserProfile = saveUserProfile;

export async function clearSessionAndAuth(): Promise<void> {
  try {
    await del(KEY_SESSION);
    await del(KEY_SESSION_ALT);
    await del(KEY_USER);
    await del(KEY_USER_ALT);
  } catch (e) {
    console.error("Error clearing session from IndexedDB:", e);
  }
}

export const clearSavedSession = clearSessionAndAuth;

// -------------------------------------------------------------
// Channel Selection Storage
// -------------------------------------------------------------

export async function getSavedSelectedChannels(): Promise<ChannelMeta[]> {
  try {
    const channels = await get<ChannelMeta[]>(KEY_SELECTED_CHANNELS);
    return channels || [];
  } catch (e) {
    console.error("Error reading selected channels from IndexedDB:", e);
    return [];
  }
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

// -------------------------------------------------------------
// Persistent Transfer Tasks & Concurrency Settings
// -------------------------------------------------------------

export async function getSavedTransferTasks<T>(): Promise<T[]> {
  try {
    const tasks = await get<T[]>(KEY_TRANSFER_TASKS);
    return tasks || [];
  } catch (e) {
    console.error("Error reading saved transfer tasks from IndexedDB:", e);
    return [];
  }
}

export async function saveTransferTasksToDb<T>(tasks: T[]): Promise<void> {
  try {
    await set(KEY_TRANSFER_TASKS, tasks);
  } catch (e) {
    console.error("Error saving transfer tasks to IndexedDB:", e);
  }
}

export async function getSavedTransferConcurrency(): Promise<1 | 2> {
  try {
    const val = await get<number>(KEY_TRANSFER_CONCURRENCY);
    return val === 2 ? 2 : 1; // Default to 1 for Telegram MTProto single-socket safety
  } catch (e) {
    console.error("Error reading transfer concurrency from IndexedDB:", e);
    return 1;
  }
}

export async function saveTransferConcurrencyToDb(concurrency: 1 | 2): Promise<void> {
  try {
    await set(KEY_TRANSFER_CONCURRENCY, concurrency);
  } catch (e) {
    console.error("Error saving transfer concurrency to IndexedDB:", e);
  }
}
