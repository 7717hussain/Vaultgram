import { get, set, del } from "idb-keyval";

const KEY_SESSION = "vaultgram_session_string";
const KEY_USER = "vaultgram_user_profile";
const KEY_CONFIG = "vaultgram_tg_config";

/**
 * Async IndexedDB Session and Profile Storage
 */
export async function getSavedSession() {
  try {
    const session = await get(KEY_SESSION);
    if (session && typeof session === "string" && session.trim()) {
      return session.trim();
    }
  } catch (e) {
    console.error("IndexedDB getSavedSession error:", e);
  }
  // Fallback to localStorage for legacy migrations
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

export async function getTgConfig() {
  try {
    const config = await get(KEY_CONFIG);
    if (config) return config;
  } catch (e) {}

  // Fallback to localStorage
  const local = localStorage.getItem("tg_stream_config");
  if (local) {
    try {
      const parsed = JSON.parse(local);
      await set(KEY_CONFIG, parsed);
      return parsed;
    } catch (e) {}
  }

  return {
    apiId: 2040,
    apiHash: "b18441a1ff607e10a989891a5462e627", // Official Telegram Web App Public ID/Hash fallback
  };
}

export async function saveTgConfig(apiId, apiHash) {
  const cfg = {
    apiId: parseInt(apiId, 10) || 2040,
    apiHash: apiHash || "b18441a1ff607e10a989891a5462e627",
  };
  await set(KEY_CONFIG, cfg);
  localStorage.setItem("tg_stream_config", JSON.stringify(cfg));
}
