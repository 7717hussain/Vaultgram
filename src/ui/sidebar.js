import { vaultStore } from "../catalog/vaultStore.js";
import { tgStreamClient } from "../telegram/client.js";

export class Sidebar {
  constructor(containerEl, { onSelectItem, onChannelChange }) {
    this.container = containerEl;
    this.onSelectItem = onSelectItem;
    this.onChannelChange = onChannelChange;
    this.searchQuery = "";

    this.render();
    this.bindEvents();

    vaultStore.onChange(() => this.updateView());
  }

  render() {
    this.container.innerHTML = `
      <aside class="sidebar-wrapper">
        <!-- Logo / App Branding Header -->
        <div class="sidebar-brand">
          <div class="brand-badge">VAULTGRAM</div>
          <div class="brand-title">Cloud Storage & Streams</div>
        </div>

        <!-- Global Search Bar -->
        <div class="search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="global-search-input" placeholder="Search files & streams (/)...">
          <button id="search-clear-btn" class="search-clear-btn hidden">&times;</button>
        </div>

        <!-- Scrollable Navigation Sections -->
        <div class="sidebar-scrollable-content">
          
          <!-- Channel Selector Section -->
          <div class="sidebar-section">
            <div class="sidebar-section-header">
              <span>Telegram Channels</span>
              <button class="section-action-btn" id="btn-refresh-channels" title="Refresh Channels">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
              </button>
            </div>
            <div class="channels-nav-list" id="channels-nav-list">
              <!-- Rendered dynamically -->
            </div>
          </div>

          <!-- File Type Categories Section -->
          <div class="sidebar-section">
            <div class="sidebar-section-header">
              <span>File Types</span>
            </div>
            <div class="category-nav-list" id="category-nav-list">
              <button class="nav-item-btn active" data-category="all">
                <div class="nav-item-left">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  <span>All Files</span>
                </div>
                <span class="nav-count-badge" id="count-all">0</span>
              </button>
              <button class="nav-item-btn" data-category="videos">
                <div class="nav-item-left">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  <span>Videos & Lectures</span>
                </div>
                <span class="nav-count-badge" id="count-videos">0</span>
              </button>
              <button class="nav-item-btn" data-category="archives">
                <div class="nav-item-left">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                  <span>Archives (ZIP / RAR)</span>
                </div>
                <span class="nav-count-badge" id="count-archives">0</span>
              </button>
              <button class="nav-item-btn" data-category="documents">
                <div class="nav-item-left">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span>Documents & PDFs</span>
                </div>
                <span class="nav-count-badge" id="count-documents">0</span>
              </button>
              <button class="nav-item-btn" data-category="images">
                <div class="nav-item-left">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  <span>Images</span>
                </div>
                <span class="nav-count-badge" id="count-images">0</span>
              </button>
              <button class="nav-item-btn" data-category="audio">
                <div class="nav-item-left">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                  <span>Audio & Music</span>
                </div>
                <span class="nav-count-badge" id="count-audio">0</span>
              </button>
            </div>
          </div>

          <!-- Custom Name Grouping Folders Section -->
          <div class="sidebar-section">
            <div class="sidebar-section-header">
              <span>Custom Name Folders</span>
              <button class="section-action-btn" id="btn-add-custom-folder" title="New Grouping Folder">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>New</span>
              </button>
            </div>
            <div class="custom-folders-list" id="custom-folders-list">
              <!-- Rendered dynamically -->
            </div>
          </div>

        </div>
      </aside>
    `;
  }

  bindEvents() {
    const searchInput = this.container.querySelector("#global-search-input");
    const searchClear = this.container.querySelector("#search-clear-btn");
    const btnRefresh = this.container.querySelector("#btn-refresh-channels");
    const btnAddFolder = this.container.querySelector("#btn-add-custom-folder");

    searchInput.oninput = (e) => {
      this.searchQuery = e.target.value.trim();
      searchClear.classList.toggle("hidden", !this.searchQuery);
      if (this.onSelectItem) {
        this.onSelectItem({ type: "search", query: this.searchQuery });
      }
    };

    searchClear.onclick = () => {
      searchInput.value = "";
      this.searchQuery = "";
      searchClear.classList.add("hidden");
      if (this.onSelectItem) {
        this.onSelectItem({ type: "search", query: "" });
      }
    };

    btnRefresh.onclick = async () => {
      btnRefresh.classList.add("spinning");
      try {
        const { publicChannels, privateChannels } = await tgStreamClient.getUserChannels();
        const all = [...publicChannels, ...privateChannels];
        vaultStore.setChannels(all);
      } catch (err) {
        console.error("Refresh channels failed:", err);
      } finally {
        btnRefresh.classList.remove("spinning");
      }
    };

    btnAddFolder.onclick = () => {
      const folderName = prompt("Enter new folder name (e.g., 'Fastlane', 'Notes'):");
      if (!folderName || !folderName.trim()) return;
      const pattern = prompt(`Match files containing keyword (defaults to '${folderName.trim()}'):`, folderName.trim());
      if (!pattern || !pattern.trim()) return;

      vaultStore.addCustomFolder(folderName, pattern);
    };

    // Category button clicks
    this.container.querySelectorAll("#category-nav-list .nav-item-btn").forEach((btn) => {
      btn.onclick = () => {
        const cat = btn.dataset.category;
        vaultStore.setActiveCategory(cat);
        this.updateCategoryActiveState(btn);
      };
    });
  }

  updateCategoryActiveState(activeBtn) {
    this.container.querySelectorAll("#category-nav-list .nav-item-btn").forEach((b) => b.classList.remove("active"));
    this.container.querySelectorAll(".custom-folder-item").forEach((b) => b.classList.remove("active"));
    if (activeBtn) activeBtn.classList.add("active");
  }

  updateView() {
    this.renderChannels();
    this.renderCategoryCounts();
    this.renderCustomFolders();
  }

  renderChannels() {
    const listEl = this.container.querySelector("#channels-nav-list");
    if (!listEl) return;

    const channels = vaultStore.channels;
    const activeId = vaultStore.activeChannelId;

    let html = `
      <button class="channel-nav-btn ${activeId === "all" ? "active" : ""}" data-channel-id="all">
        <div class="nav-item-left">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          <span class="channel-name-truncate">Unified View (All Channels)</span>
        </div>
      </button>
    `;

    if (channels.length === 0) {
      html += `<div class="sidebar-empty-hint">No channels loaded yet</div>`;
    } else {
      for (const ch of channels) {
        const isAct = activeId === ch.id;
        const iconSvg = ch.isPublic
          ? `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`
          : `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

        html += `
          <button class="channel-nav-btn ${isAct ? "active" : ""}" data-channel-id="${ch.id}">
            <div class="nav-item-left">
              ${iconSvg}
              <span class="channel-name-truncate" title="${this.escapeHtml(ch.title)}">${this.escapeHtml(ch.title)}</span>
            </div>
            <span class="channel-badge ${ch.isPublic ? "public" : "private"}" style="font-size: 0.6rem; padding: 1px 4px;">
              ${ch.isPublic ? "Pub" : "Priv"}
            </span>
          </button>
        `;
      }
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll(".channel-nav-btn").forEach((btn) => {
      btn.onclick = () => {
        const chId = btn.dataset.channelId;
        vaultStore.setActiveChannel(chId);
        if (this.onChannelChange) {
          this.onChannelChange(chId);
        }
      };
    });
  }

  renderCategoryCounts() {
    const counts = vaultStore.getCategoryCounts();
    for (const [key, val] of Object.entries(counts)) {
      const el = this.container.querySelector(`#count-${key}`);
      if (el) el.textContent = val;
    }
  }

  renderCustomFolders() {
    const listEl = this.container.querySelector("#custom-folders-list");
    if (!listEl) return;

    const folders = vaultStore.customFolders;
    const activeFolder = vaultStore.activeCustomFolder;
    const folderCounts = vaultStore.getCustomFolderCounts();

    if (folders.length === 0) {
      listEl.innerHTML = `<div class="sidebar-empty-hint">No custom folders created</div>`;
      return;
    }

    let html = "";
    for (const folder of folders) {
      const isAct = activeFolder === folder.name;
      const count = folderCounts[folder.name] || 0;
      html += `
        <div class="custom-folder-item ${isAct ? "active" : ""}" data-folder="${this.escapeHtml(folder.name)}">
          <div class="nav-item-left">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span class="channel-name-truncate">${this.escapeHtml(folder.name)}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span class="nav-count-badge">${count}</span>
            <button class="btn-delete-folder" data-delete-folder="${this.escapeHtml(folder.name)}" title="Delete Folder">&times;</button>
          </div>
        </div>
      `;
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll(".custom-folder-item").forEach((el) => {
      el.onclick = (e) => {
        if (e.target.classList.contains("btn-delete-folder")) return;
        const folderName = el.dataset.folder;
        vaultStore.setActiveCustomFolder(folderName);
        this.updateCategoryActiveState(el);
      };
    });

    listEl.querySelectorAll(".btn-delete-folder").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const fName = btn.dataset.deleteFolder;
        vaultStore.removeCustomFolder(fName);
      };
    });
  }

  escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
