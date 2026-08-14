/**
 * VaultStore: State Management for Televault / Vaultgram
 * Handles Channels, Dual-Zone Sidebar, Categories, Custom Virtual Folders,
 * Pinned & Starred items, Rate-Limit status, and Queues.
 */

const STORAGE_SELECTED_CHANNELS = "televault_selected_channels";
const STORAGE_CUSTOM_FOLDERS = "televault_custom_folders";
const STORAGE_PINNED_IDS = "televault_pinned_ids";
const STORAGE_FAVORITE_IDS = "televault_favorite_ids";
const STORAGE_VIEW_MODE = "televault_view_mode";

class VaultStore {
  constructor() {
    this.channels = []; // Array of { id, title, username, isPublic, unreadCount }
    this.selectedChannelIds = this.loadSelectedChannelIds(); // Persistent selected channels for Drive
    this.activeChannelId = "UNIFIED"; // 'UNIFIED' or specific channel ID
    this.activeCategory = "ALL"; // 'ALL' | 'IMAGES' | 'VIDEOS' | 'DOCS' | 'ARCHIVES' | 'AUDIO' | 'PINNED' | 'FAVORITES' | 'RECENTS' | string (custom folder ID)
    
    this.customFolders = this.loadCustomFolders(); // Record<string, { id: string, name: string, pattern: string, fileIds: string[] }>
    this.pinnedFileIds = this.loadPinnedIds(); // Set<string>
    this.favoriteFileIds = this.loadFavoriteIds(); // Set<string>
    
    this.viewMode = localStorage.getItem(STORAGE_VIEW_MODE) || "grid"; // 'grid' | 'list'
    this.sortBy = "date"; // 'date' | 'name' | 'size' | 'type'
    this.sortOrder = "desc"; // 'asc' | 'desc'
    
    this.mediaItems = []; // Array of indexed items
    this.channelMediaCache = new Map(); // channelId -> Array of items
    this.rateLimitWait = 0; // seconds remaining
    this.rateLimitTimer = null;
    
    this.listeners = new Set();
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const cb of this.listeners) {
      cb();
    }
  }

  // --- Persistence ---
  loadSelectedChannelIds() {
    try {
      const saved = localStorage.getItem(STORAGE_SELECTED_CHANNELS);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  }

  saveSelectedChannelIds(ids) {
    this.selectedChannelIds = ids;
    localStorage.setItem(STORAGE_SELECTED_CHANNELS, JSON.stringify(ids));
    this.notify();
  }

  loadCustomFolders() {
    try {
      const saved = localStorage.getItem(STORAGE_CUSTOM_FOLDERS);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      "fastlane": { id: "fastlane", name: "Fastlane", pattern: "fastlane", fileIds: [] },
      "notes": { id: "notes", name: "Notes & Lectures", pattern: "lec", fileIds: [] }
    };
  }

  saveCustomFolders() {
    localStorage.setItem(STORAGE_CUSTOM_FOLDERS, JSON.stringify(this.customFolders));
  }

  loadPinnedIds() {
    try {
      const saved = localStorage.getItem(STORAGE_PINNED_IDS);
      if (saved) return new Set(JSON.parse(saved));
    } catch (e) {}
    return new Set();
  }

  savePinnedIds() {
    localStorage.setItem(STORAGE_PINNED_IDS, JSON.stringify(Array.from(this.pinnedFileIds)));
  }

  loadFavoriteIds() {
    try {
      const saved = localStorage.getItem(STORAGE_FAVORITE_IDS);
      if (saved) return new Set(JSON.parse(saved));
    } catch (e) {}
    return new Set();
  }

  saveFavoriteIds() {
    localStorage.setItem(STORAGE_FAVORITE_IDS, JSON.stringify(Array.from(this.favoriteFileIds)));
  }

  // --- Actions ---
  setViewMode(mode) {
    this.viewMode = mode;
    localStorage.setItem(STORAGE_VIEW_MODE, mode);
    this.notify();
  }

  setSort(sortBy) {
    if (this.sortBy === sortBy) {
      this.sortOrder = this.sortOrder === "asc" ? "desc" : "asc";
    } else {
      this.sortBy = sortBy;
      this.sortOrder = "desc";
    }
    this.notify();
  }

  setRateLimit(seconds) {
    this.rateLimitWait = seconds;
    if (this.rateLimitTimer) clearInterval(this.rateLimitTimer);
    if (seconds > 0) {
      this.rateLimitTimer = setInterval(() => {
        this.rateLimitWait--;
        if (this.rateLimitWait <= 0) {
          clearInterval(this.rateLimitTimer);
          this.rateLimitWait = 0;
        }
        this.notify();
      }, 1000);
    }
    this.notify();
  }

  togglePin(fileId) {
    if (this.pinnedFileIds.has(fileId)) {
      this.pinnedFileIds.delete(fileId);
    } else {
      this.pinnedFileIds.add(fileId);
    }
    this.savePinnedIds();
    this.notify();
  }

  toggleFavorite(fileId) {
    if (this.favoriteFileIds.has(fileId)) {
      this.favoriteFileIds.delete(fileId);
    } else {
      this.favoriteFileIds.add(fileId);
    }
    this.saveFavoriteIds();
    this.notify();
  }

  addCustomFolder(name, pattern = "") {
    if (!name || !name.trim()) return;
    const id = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_") + "_" + Date.now();
    this.customFolders[id] = {
      id,
      name: name.trim(),
      pattern: (pattern || name).trim().toLowerCase(),
      fileIds: [],
    };
    this.saveCustomFolders();
    this.notify();
  }

  removeCustomFolder(id) {
    delete this.customFolders[id];
    if (this.activeCategory === id) {
      this.activeCategory = "ALL";
    }
    this.saveCustomFolders();
    this.notify();
  }

  assignFileToFolder(folderId, fileId) {
    const folder = this.customFolders[folderId];
    if (folder) {
      if (!folder.fileIds.includes(fileId)) {
        folder.fileIds.push(fileId);
        this.saveCustomFolders();
        this.notify();
      }
    }
  }

  setChannels(allChannels) {
    this.channels = allChannels;
    this.notify();
  }

  setActiveChannel(channelId) {
    this.activeChannelId = channelId;
    this.rebuildMediaList();
    this.notify();
  }

  setActiveCategory(category) {
    this.activeCategory = category;
    this.notify();
  }

  cacheChannelItems(channelId, items) {
    this.channelMediaCache.set(String(channelId), items);
    this.rebuildMediaList();
  }

  rebuildMediaList() {
    let combined = [];
    if (this.activeChannelId === "UNIFIED") {
      // Aggregate from all selected channels
      const activeIds = this.selectedChannelIds.length > 0
        ? this.selectedChannelIds
        : this.channels.map(c => c.id);

      for (const chId of activeIds) {
        const items = this.channelMediaCache.get(String(chId)) || [];
        combined = combined.concat(items);
      }
    } else {
      combined = this.channelMediaCache.get(String(this.activeChannelId)) || [];
    }

    // Deduplicate by item ID
    const unique = new Map();
    for (const item of combined) {
      if (!unique.has(item.id)) {
        unique.set(item.id, item);
      }
    }

    this.mediaItems = Array.from(unique.values());
  }

  getFilteredAndSortedItems(searchQuery = "") {
    let items = [...this.mediaItems];

    // 1. Filter by category / quick access / folder
    if (this.activeCategory === "IMAGES") {
      items = items.filter((i) => i.category === "images");
    } else if (this.activeCategory === "VIDEOS") {
      items = items.filter((i) => i.category === "videos");
    } else if (this.activeCategory === "DOCS") {
      items = items.filter((i) => i.category === "documents");
    } else if (this.activeCategory === "ARCHIVES") {
      items = items.filter((i) => i.category === "archives");
    } else if (this.activeCategory === "AUDIO") {
      items = items.filter((i) => i.category === "audio");
    } else if (this.activeCategory === "PINNED") {
      items = items.filter((i) => this.pinnedFileIds.has(i.id));
    } else if (this.activeCategory === "FAVORITES") {
      items = items.filter((i) => this.favoriteFileIds.has(i.id));
    } else if (this.activeCategory === "RECENTS") {
      items.sort((a, b) => (b.date || 0) - (a.date || 0));
    } else if (this.customFolders[this.activeCategory]) {
      const folder = this.customFolders[this.activeCategory];
      const p = folder.pattern;
      items = items.filter((i) => 
        (p && (i.fileName.toLowerCase().includes(p) || (i.caption && i.caption.toLowerCase().includes(p)))) ||
        folder.fileIds.includes(i.id)
      );
    }

    // 2. Search query filter
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(
        (i) =>
          i.fileName.toLowerCase().includes(q) ||
          (i.mimeType && i.mimeType.toLowerCase().includes(q)) ||
          (i.caption && i.caption.toLowerCase().includes(q))
      );
    }

    // 3. Sorting
    items.sort((a, b) => {
      let valA, valB;
      if (this.sortBy === "name") {
        valA = a.fileName.toLowerCase();
        valB = b.fileName.toLowerCase();
        return this.sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (this.sortBy === "size") {
        valA = a.size || 0;
        valB = b.size || 0;
      } else if (this.sortBy === "type") {
        valA = a.category || "";
        valB = b.category || "";
        return this.sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        // Date
        valA = a.date || 0;
        valB = b.date || 0;
      }

      return this.sortOrder === "asc" ? valA - valB : valB - valA;
    });

    return items;
  }

  getStats() {
    let totalBytes = 0;
    for (const item of this.mediaItems) {
      totalBytes += item.size || 0;
    }
    return {
      indexedCount: this.mediaItems.length,
      totalBytes,
      channelCount: this.channels.length,
    };
  }

  getCategoryCounts() {
    const counts = {
      ALL: this.mediaItems.length,
      IMAGES: 0,
      VIDEOS: 0,
      DOCS: 0,
      ARCHIVES: 0,
      AUDIO: 0,
      PINNED: 0,
      FAVORITES: 0,
      RECENTS: Math.min(this.mediaItems.length, 25),
    };

    for (const item of this.mediaItems) {
      if (item.category === "images") counts.IMAGES++;
      else if (item.category === "videos") counts.VIDEOS++;
      else if (item.category === "documents") counts.DOCS++;
      else if (item.category === "archives") counts.ARCHIVES++;
      else if (item.category === "audio") counts.AUDIO++;

      if (this.pinnedFileIds.has(item.id)) counts.PINNED++;
      if (this.favoriteFileIds.has(item.id)) counts.FAVORITES++;
    }

    return counts;
  }
}

export const vaultStore = new VaultStore();
