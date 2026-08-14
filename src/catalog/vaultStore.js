/**
 * VaultStore: Manages dynamic Telegram Channel data, categorized media items,
 * and user-created custom virtual grouping folders.
 */

const STORAGE_CUSTOM_FOLDERS = "vaultgram_custom_folders";

class VaultStore {
  constructor() {
    this.channels = []; // Array of channel objects { id, title, username, isPublic }
    this.activeChannelId = "all"; // 'all' (Unified view) or specific channelId
    this.activeCategory = "all"; // 'all' | 'videos' | 'archives' | 'audio' | 'images' | 'documents'
    this.activeCustomFolder = null; // null or folder name string
    this.mediaItems = []; // Array of media items fetched dynamically
    this.customFolders = this.loadCustomFolders(); // Array of { name: 'Fastlane', pattern: 'fastlane' }
    this.isLoading = false;
    this.channelMediaCache = new Map(); // channelId -> Array of items
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

  loadCustomFolders() {
    try {
      const saved = localStorage.getItem(STORAGE_CUSTOM_FOLDERS);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      { name: "Fastlane", pattern: "fastlane" },
      { name: "Lectures", pattern: "lec" },
    ];
  }

  saveCustomFolders() {
    localStorage.setItem(STORAGE_CUSTOM_FOLDERS, JSON.stringify(this.customFolders));
  }

  addCustomFolder(name, pattern) {
    if (!name || !pattern) return;
    this.customFolders.push({
      name: name.trim(),
      pattern: pattern.trim().toLowerCase(),
    });
    this.saveCustomFolders();
    this.notify();
  }

  removeCustomFolder(name) {
    this.customFolders = this.customFolders.filter((f) => f.name !== name);
    if (this.activeCustomFolder === name) {
      this.activeCustomFolder = null;
    }
    this.saveCustomFolders();
    this.notify();
  }

  setChannels(channels) {
    this.channels = channels;
    this.notify();
  }

  setActiveChannel(channelId) {
    this.activeChannelId = channelId;
    this.activeCustomFolder = null;
    this.notify();
  }

  setActiveCategory(category) {
    this.activeCategory = category;
    this.activeCustomFolder = null;
    this.notify();
  }

  setActiveCustomFolder(folderName) {
    this.activeCustomFolder = folderName;
    this.notify();
  }

  cacheChannelItems(channelId, items) {
    this.channelMediaCache.set(String(channelId), items);
    this.rebuildMediaList();
  }

  rebuildMediaList() {
    let combined = [];
    if (this.activeChannelId === "all") {
      for (const items of this.channelMediaCache.values()) {
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
    this.notify();
  }

  /**
   * Filter media items based on current channel, file category, custom folder, and search query
   */
  getFilteredItems(searchQuery = "") {
    let items = this.mediaItems;

    // 1. Filter by File Category
    if (this.activeCategory && this.activeCategory !== "all") {
      items = items.filter((i) => i.category === this.activeCategory);
    }

    // 2. Filter by Custom Name Grouping Folder
    if (this.activeCustomFolder) {
      const folder = this.customFolders.find((f) => f.name === this.activeCustomFolder);
      if (folder) {
        const p = folder.pattern;
        items = items.filter(
          (i) => i.fileName.toLowerCase().includes(p) || i.caption.toLowerCase().includes(p)
        );
      }
    }

    // 3. Filter by search query
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(
        (i) =>
          i.fileName.toLowerCase().includes(q) ||
          i.caption.toLowerCase().includes(q)
      );
    }

    return items;
  }

  getCategoryCounts() {
    const counts = {
      all: this.mediaItems.length,
      videos: 0,
      archives: 0,
      audio: 0,
      images: 0,
      documents: 0,
      other: 0,
    };

    for (const item of this.mediaItems) {
      if (counts[item.category] !== undefined) {
        counts[item.category]++;
      } else {
        counts.other++;
      }
    }

    return counts;
  }

  getCustomFolderCounts() {
    const counts = {};
    for (const folder of this.customFolders) {
      const p = folder.pattern;
      const matchCount = this.mediaItems.filter(
        (i) => i.fileName.toLowerCase().includes(p) || i.caption.toLowerCase().includes(p)
      ).length;
      counts[folder.name] = matchCount;
    }
    return counts;
  }
}

export const vaultStore = new VaultStore();
