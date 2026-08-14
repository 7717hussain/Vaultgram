import { vaultStore } from "../catalog/vaultStore.js";
import { tgStreamClient } from "../telegram/client.js";
import { createIcon, Icons } from "./icons.js";

/**
 * Dual-Zone Split Sidebar:
 * - Zone A: Top 25% (Horizontal Scrollable Channel Carousel: Unified View + Channel Tiles)
 * - Zone B: Bottom 75% (Categories, Quick Access, Custom Folders, Storage Inspector & System Controls)
 */
export class Sidebar {
  constructor(containerEl, { onOpenWizard, onLogout }) {
    this.container = containerEl;
    this.onOpenWizard = onOpenWizard;
    this.onLogout = onLogout;

    this.render();
    this.bindEvents();

    vaultStore.onChange(() => this.updateView());
  }

  render() {
    this.container.innerHTML = `
      <aside class="dual-zone-sidebar">
        <!-- ZONE A: TOP 25% HORIZONTAL CHANNEL CAROUSEL -->
        <div class="sidebar-zone-a">
          <div class="zone-a-header">
            <span class="zone-title">Active Workspace</span>
            <button class="zone-action-btn" id="btn-re-wizard" title="Channel Setup Wizard">
              <span class="icon-wizard-holder"></span>
            </button>
          </div>
          <div class="channel-carousel-row" id="channel-carousel-row">
            <!-- Rendered dynamically -->
          </div>
        </div>

        <!-- ZONE B: BOTTOM 75% NAVIGATION & STORAGE INSPECTOR -->
        <div class="sidebar-zone-b">
          <div class="zone-b-scroll-area">
            
            <!-- Standard Media Categories -->
            <div class="nav-group">
              <span class="nav-group-title">Media Categories</span>
              <div class="nav-items-list" id="nav-categories-list">
                <button class="nav-btn active" data-category="ALL">
                  <span class="nav-btn-left">
                    <span class="icon-holder icon-all"></span>
                    <span>All Files</span>
                  </span>
                  <span class="nav-count" id="count-cat-all">0</span>
                </button>
                <button class="nav-btn" data-category="IMAGES">
                  <span class="nav-btn-left">
                    <span class="icon-holder icon-img"></span>
                    <span>Images</span>
                  </span>
                  <span class="nav-count" id="count-cat-images">0</span>
                </button>
                <button class="nav-btn" data-category="VIDEOS">
                  <span class="nav-btn-left">
                    <span class="icon-holder icon-vid"></span>
                    <span>Videos</span>
                  </span>
                  <span class="nav-count" id="count-cat-videos">0</span>
                </button>
                <button class="nav-btn" data-category="DOCS">
                  <span class="nav-btn-left">
                    <span class="icon-holder icon-doc"></span>
                    <span>Documents</span>
                  </span>
                  <span class="nav-count" id="count-cat-docs">0</span>
                </button>
                <button class="nav-btn" data-category="ARCHIVES">
                  <span class="nav-btn-left">
                    <span class="icon-holder icon-zip"></span>
                    <span>Archives / ZIPs</span>
                  </span>
                  <span class="nav-count" id="count-cat-archives">0</span>
                </button>
                <button class="nav-btn" data-category="AUDIO">
                  <span class="nav-btn-left">
                    <span class="icon-holder icon-aud"></span>
                    <span>Audio</span>
                  </span>
                  <span class="nav-count" id="count-cat-audio">0</span>
                </button>
              </div>
            </div>

            <!-- Quick Access -->
            <div class="nav-group">
              <span class="nav-group-title">Quick Access</span>
              <div class="nav-items-list" id="nav-quick-list">
                <button class="nav-btn" data-category="PINNED">
                  <span class="nav-btn-left">
                    <span class="icon-holder icon-pin"></span>
                    <span>Pinned</span>
                  </span>
                  <span class="nav-count" id="count-quick-pinned">0</span>
                </button>
                <button class="nav-btn" data-category="FAVORITES">
                  <span class="nav-btn-left">
                    <span class="icon-holder icon-star"></span>
                    <span>Favorites</span>
                  </span>
                  <span class="nav-count" id="count-quick-favs">0</span>
                </button>
                <button class="nav-btn" data-category="RECENTS">
                  <span class="nav-btn-left">
                    <span class="icon-holder icon-clock"></span>
                    <span>Recent Uploads</span>
                  </span>
                  <span class="nav-count" id="count-quick-recents">0</span>
                </button>
              </div>
            </div>

            <!-- Custom Virtual Folders -->
            <div class="nav-group">
              <div class="nav-group-header-row">
                <span class="nav-group-title">Custom Folders</span>
                <button class="btn-add-folder" id="btn-sidebar-new-folder" title="New Custom Folder">
                  <span class="icon-plus-holder"></span>
                  <span>New</span>
                </button>
              </div>
              <div class="nav-items-list" id="nav-custom-folders-list"></div>
            </div>

          </div>

          <!-- Bottom Footer: Storage Inspector & Rate Limit Badge -->
          <div class="sidebar-footer">
            <div class="storage-inspector">
              <div class="storage-meta">
                <span class="storage-label">Indexed Storage</span>
                <span class="storage-val" id="storage-bytes-val">0 MB</span>
              </div>
              <div class="storage-progress-bar">
                <div class="storage-progress-fill" id="storage-progress-fill" style="width: 15%;"></div>
              </div>
              <div class="storage-sub">
                <span id="storage-files-count">0 items</span>
                <span>• Local Cache</span>
              </div>
            </div>

            <!-- Rate Limit Warning Banner (If active) -->
            <div class="rate-limit-badge hidden" id="rate-limit-banner">
              <span class="icon-rate-holder"></span>
              <span id="rate-limit-text">Flood Wait: 0s</span>
            </div>

            <!-- User Status & Logout Toolbar -->
            <div class="sidebar-user-toolbar">
              <button class="user-action-btn" id="btn-manage-channels" title="Select Channels">
                <span class="icon-channels-holder"></span>
                <span>Channels</span>
              </button>
              <button class="user-action-btn danger" id="btn-logout" title="Wipe Session & Logout">
                <span class="icon-logout-holder"></span>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </aside>
    `;

    // Hydrate Static Icons
    const injectIcon = (selector, iconDef, size = 14) => {
      const el = this.container.querySelector(selector);
      if (el) {
        while (el.firstChild) el.removeChild(el.firstChild);
        el.appendChild(createIcon(iconDef, { size }));
      }
    };

    injectIcon(".icon-wizard-holder", Icons.SlidersHorizontal, 12);
    injectIcon(".icon-all", Icons.Folder, 14);
    injectIcon(".icon-img", Icons.Image, 14);
    injectIcon(".icon-vid", Icons.Video, 14);
    injectIcon(".icon-doc", Icons.FileText, 14);
    injectIcon(".icon-zip", Icons.Archive, 14);
    injectIcon(".icon-aud", Icons.Music, 14);
    injectIcon(".icon-pin", Icons.Pin, 14);
    injectIcon(".icon-star", Icons.Star, 14);
    injectIcon(".icon-clock", Icons.Clock, 14);
    injectIcon(".icon-plus-holder", Icons.Plus, 12);
    injectIcon(".icon-rate-holder", Icons.ShieldAlert, 13);
    injectIcon(".icon-channels-holder", Icons.Layers, 13);
    injectIcon(".icon-logout-holder", Icons.LogOut, 13);
  }

  bindEvents() {
    // Re-run Wizard
    const btnWizard = this.container.querySelector("#btn-re-wizard");
    const btnManage = this.container.querySelector("#btn-manage-channels");
    if (btnWizard) btnWizard.onclick = () => this.onOpenWizard && this.onOpenWizard();
    if (btnManage) btnManage.onclick = () => this.onOpenWizard && this.onOpenWizard();

    // Logout
    const btnLogout = this.container.querySelector("#btn-logout");
    if (btnLogout) btnLogout.onclick = () => this.onLogout && this.onLogout();

    // Create New Custom Folder
    const btnNewFolder = this.container.querySelector("#btn-sidebar-new-folder");
    if (btnNewFolder) {
      btnNewFolder.onclick = () => {
        const name = prompt("Enter new folder name (e.g., 'Fastlane', 'Lecture Notes'):");
        if (!name || !name.trim()) return;
        const pattern = prompt(`Match keyword in file names (defaults to '${name.trim()}'):`, name.trim());
        vaultStore.addCustomFolder(name, pattern);
      };
    }

    // Category Buttons
    this.container.querySelectorAll(".nav-btn[data-category]").forEach((btn) => {
      btn.onclick = () => {
        const cat = btn.dataset.category;
        vaultStore.setActiveCategory(cat);
      };
    });
  }

  updateView() {
    this.renderZoneAChannels();
    this.renderZoneBCustomFolders();
    this.updateCategoryCountsAndActiveState();
    this.updateStorageInspector();
    this.updateRateLimitState();
  }

  // --- ZONE A: HORIZONTAL CAROUSEL ---
  renderZoneAChannels() {
    const row = this.container.querySelector("#channel-carousel-row");
    if (!row) return;

    while (row.firstChild) row.removeChild(row.firstChild);

    const activeChannelId = vaultStore.activeChannelId;
    const selectedIds = vaultStore.selectedChannelIds;
    const activeChannels = selectedIds.length > 0
      ? vaultStore.channels.filter((c) => selectedIds.includes(c.id))
      : vaultStore.channels;

    // 1. Unified View Tile (Always First)
    const isUnified = activeChannelId === "UNIFIED";
    const unifiedTile = document.createElement("button");
    unifiedTile.className = `channel-tile ${isUnified ? "active" : ""}`;
    unifiedTile.title = "Unified View (All Synced Channels)";

    const uAvatar = document.createElement("div");
    uAvatar.className = "channel-tile-avatar unified";
    uAvatar.appendChild(createIcon(Icons.Layers, { size: 15 }));
    unifiedTile.appendChild(uAvatar);

    const uInfo = document.createElement("div");
    uInfo.className = "channel-tile-info";
    
    const uTitle = document.createElement("span");
    uTitle.className = "channel-tile-title";
    uTitle.textContent = "All Channels";
    uInfo.appendChild(uTitle);

    const uCount = document.createElement("span");
    uCount.className = "channel-tile-sub";
    uCount.textContent = "Unified View";
    uInfo.appendChild(uCount);

    unifiedTile.appendChild(uInfo);

    unifiedTile.onclick = () => {
      vaultStore.setActiveChannel("UNIFIED");
    };
    row.appendChild(unifiedTile);

    // 2. Individual Channel Cards
    for (const ch of activeChannels) {
      const isAct = activeChannelId === ch.id;
      const tile = document.createElement("button");
      tile.className = `channel-tile ${isAct ? "active" : ""}`;
      tile.title = ch.title || "";

      const avatar = document.createElement("div");
      avatar.className = "channel-tile-avatar";
      const initial = (ch.title || "C").charAt(0).toUpperCase();
      avatar.textContent = initial;
      tile.appendChild(avatar);

      const info = document.createElement("div");
      info.className = "channel-tile-info";

      const title = document.createElement("span");
      title.className = "channel-tile-title";
      title.textContent = ch.title || "Untitled";
      info.appendChild(title);

      const sub = document.createElement("span");
      sub.className = "channel-tile-sub";
      sub.textContent = ch.username ? `@${ch.username}` : "Telegram";
      info.appendChild(sub);

      tile.appendChild(info);

      tile.onclick = () => {
        vaultStore.setActiveChannel(ch.id);
      };

      row.appendChild(tile);
    }
  }

  // --- ZONE B: CUSTOM FOLDERS & COUNTS ---
  renderZoneBCustomFolders() {
    const list = this.container.querySelector("#nav-custom-folders-list");
    if (!list) return;

    while (list.firstChild) list.removeChild(list.firstChild);

    const folders = Object.values(vaultStore.customFolders);

    if (folders.length === 0) {
      const empty = document.createElement("div");
      empty.className = "nav-empty-hint";
      empty.textContent = "No custom folders";
      list.appendChild(empty);
      return;
    }

    for (const folder of folders) {
      const isAct = vaultStore.activeCategory === folder.id;
      const btn = document.createElement("div");
      btn.className = `nav-btn ${isAct ? "active" : ""}`;

      const left = document.createElement("div");
      left.className = "nav-btn-left";
      left.appendChild(createIcon(Icons.Folder, { size: 14 }));

      const nameSpan = document.createElement("span");
      nameSpan.textContent = folder.name;
      left.appendChild(nameSpan);
      btn.appendChild(left);

      const right = document.createElement("div");
      right.style.cssText = "display:flex;align-items:center;gap:4px;";

      const delBtn = document.createElement("button");
      delBtn.className = "nav-del-folder-btn";
      delBtn.title = "Delete Folder";
      delBtn.appendChild(createIcon(Icons.Trash2, { size: 12 }));
      delBtn.onclick = (e) => {
        e.stopPropagation();
        vaultStore.removeCustomFolder(folder.id);
      };
      right.appendChild(delBtn);

      btn.appendChild(right);

      btn.onclick = () => {
        vaultStore.setActiveCategory(folder.id);
      };

      list.appendChild(btn);
    }
  }

  updateCategoryCountsAndActiveState() {
    const counts = vaultStore.getCategoryCounts();

    const setVal = (id, val) => {
      const el = this.container.querySelector(id);
      if (el) el.textContent = val;
    };

    setVal("#count-cat-all", counts.ALL);
    setVal("#count-cat-images", counts.IMAGES);
    setVal("#count-cat-videos", counts.VIDEOS);
    setVal("#count-cat-docs", counts.DOCS);
    setVal("#count-cat-archives", counts.ARCHIVES);
    setVal("#count-cat-audio", counts.AUDIO);

    setVal("#count-quick-pinned", counts.PINNED);
    setVal("#count-quick-favs", counts.FAVORITES);
    setVal("#count-quick-recents", counts.RECENTS);

    // Active state highlighting
    this.container.querySelectorAll(".nav-btn[data-category]").forEach((b) => {
      b.classList.toggle("active", b.dataset.category === vaultStore.activeCategory);
    });
  }

  updateStorageInspector() {
    const stats = vaultStore.getStats();
    const bytesVal = this.container.querySelector("#storage-bytes-val");
    const countVal = this.container.querySelector("#storage-files-count");
    const fill = this.container.querySelector("#storage-progress-fill");

    if (bytesVal) bytesVal.textContent = this.formatBytes(stats.totalBytes);
    if (countVal) countVal.textContent = `${stats.indexedCount} files`;
    if (fill) {
      const pct = Math.min(100, Math.max(8, Math.round((stats.indexedCount / 100) * 100)));
      fill.style.width = `${pct}%`;
    }
  }

  updateRateLimitState() {
    const banner = this.container.querySelector("#rate-limit-banner");
    const txt = this.container.querySelector("#rate-limit-text");
    if (!banner || !txt) return;

    if (vaultStore.rateLimitWait > 0) {
      banner.classList.remove("hidden");
      txt.textContent = `Flood Wait: ${vaultStore.rateLimitWait}s`;
    } else {
      banner.classList.add("hidden");
    }
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 MB";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }
}
