import { get, set, del } from "idb-keyval";

const KEY_SESSION = "vaultgram_session_string";
const KEY_USER = "vaultgram_user_profile";
const KEY_CONFIG = "vaultgram_tg_config";

// Official Telegram WebApp public credentials (always available out of the box)
export const DEFAULT_TELEGRAM_API_ID = 2040;
export const DEFAULT_TELEGRAM_API_HASH = "b18441a1ff607e10a989891a5462e627";

let inMemoryConfig = null;

export function getTgConfigSync() {
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
    } catch (e) {}
  }
  inMemoryConfig = {
    apiId: DEFAULT_TELEGRAM_API_ID,
    apiHash: DEFAULT_TELEGRAM_API_HASH,
  };
  return inMemoryConfig;
}

export async function getTgConfig() {
  const sync = getTgConfigSync();
  try {
    const config = await get(KEY_CONFIG);
    if (config && config.apiId && config.apiHash) {
      inMemoryConfig = config;
      return config;
    }
  } catch (e) {}
  return sync;
}

export async function saveTgConfig(apiId, apiHash) {
  const cfg = {
    apiId: parseInt(apiId, 10) || DEFAULT_TELEGRAM_API_ID,
    apiHash: (apiHash || DEFAULT_TELEGRAM_API_HASH).trim(),
  };
  inMemoryConfig = cfg;
  await set(KEY_CONFIG, cfg);
  localStorage.setItem("tg_stream_config", JSON.stringify(cfg));
}

export async function getSavedSession() {
  try {
    const session = await get(KEY_SESSION);
    if (session && typeof session === "string" && session.trim()) {
      return session.trim();
    }
  } catch (e) {
    console.error("IndexedDB getSavedSession error:", e);
  }
  const local = localStorage.getItem("tg_stream_session");
  if (local && local.trim()) {
    await setSavedSession(local.trim());
    localStorage.removeItem("tg_stream_session");
    return local.trim();
  }
  return "";
}

export async function setSavedSession(sessionString) {
  if (sessionString) {
    await set(KEY_SESSION, sessionString.trim());
  }
}

export async function clearSavedSession() {
  await del(KEY_SESSION);
  await del(KEY_USER);
  localStorage.removeItem("tg_stream_session");
}

export async function getSavedUserProfile() {
  try {
    return await get(KEY_USER);
  } catch (e) {
    return null;
  }
}

export async function setSavedUserProfile(profile) {
  if (profile) {
    await set(KEY_USER, profile);
  }
}
