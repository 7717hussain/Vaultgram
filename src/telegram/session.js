// Session storage and management using localStorage / IndexedDB
const SESSION_KEY = "tg_stream_session";
const CONFIG_KEY = "tg_stream_config";

export function getSavedSession() {
  const saved = localStorage.getItem(SESSION_KEY);
  if (saved && saved.trim()) {
    return saved.trim();
  }
  return "";
}

export function saveSession(sessionString) {
  if (sessionString) {
    localStorage.setItem(SESSION_KEY, sessionString.trim());
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getTgConfig() {
  const custom = localStorage.getItem(CONFIG_KEY);
  if (custom) {
    try {
      return JSON.parse(custom);
    } catch (e) {}
  }
  return {
    apiId: null,
    apiHash: null,
  };
}

export function saveTgConfig(apiId, apiHash) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ apiId, apiHash }));
}
