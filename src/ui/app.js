import { vaultStore } from "../catalog/vaultStore.js";
import { VideoPlayer } from "../player/player.js";
import { Sidebar } from "./sidebar.js";
import { MediaBrowser } from "./mediaBrowser.js";
import { AuthModal } from "./authModal.js";
import { ShortcutsModal } from "./shortcutsModal.js";
import { tgStreamClient } from "../telegram/client.js";
import { getSavedSession, clearSavedSession } from "../telegram/session.js";
import { createIcon, Icons } from "./icons.js";

export class App {
  constructor(rootEl) {
    this.root = rootEl;
    this.player = null;
    this.sidebar = null;
    this.mediaBrowser = null;
    this.authModal = null;
    this.shortcutsModal = null;
    this.sidebarCollapsed = false;

    this.renderLayout();
    this.initComponents();
    this.bindGlobalShortcuts();
    this.loadUserData();
  }

  renderLayout() {
    this.root.innerHTML = `
      <div class="app-layout">
        <!-- Top Application Navbar -->
        <header class="app-header">
          <div class="header-left">
            <!-- Sidebar Minimize / Toggle Button -->
            <button class="sidebar-toggle-btn" id="btn-toggle-sidebar" title="Toggle Sidebar">
              <span class="toggle-icon-holder"></span>
            </button>
            <div class="app-brand-name">
              <span class="brand-logo-icon"></span>
              <span>Televault</span>
            </div>
          </div>

          <!-- Centered Global Drive Search Input -->
          <div class="header-search-container">
            <span class="header-search-icon" id="search-icon-holder"></span>
            <input 
              type="text" 
              class="header-search-input" 
              id="header-global-search" 
              placeholder="Search files, mime-types, and captions across channels (/)..."
            />
            <button class="header-search-clear hidden" id="header-search-clear" title="Clear Search">
              <span class="clear-icon-holder"></span>
            </button>
          </div>

          <div class="header-right">
            <!-- Shortcuts Help Button -->
            <button class="tg-status-btn" id="shortcuts-help-btn" title="Keyboard Shortcuts (?)">
              <span class="keyboard-icon-holder"></span>
              <span>Hotkeys</span>
            </button>

            <!-- Connection Status Badge -->
            <button class="tg-status-btn" id="tg-status-btn" title="Telegram Connection Status">
              <span class="status-dot disconnected" id="header-status-dot"></span>
              <span id="header-status-text">Connecting...</span>
            </button>
          </div>
        </header>

        <!-- Main Body: Dual-Zone Sidebar + Drive Explorer Stage -->
        <div class="app-body">
          <!-- Sidebar Container (Dual-Zone: Top 25% Channels + Bottom 75% Categories) -->
          <div class="sidebar-container" id="sidebar-container"></div>

          <!-- Main Content Stage (Modern Drive Grid/List File Manager) -->
          <main class="content-stage">
            <!-- Retained Video Player (Background runtime for streaming) -->
            <div id="player-container" class="hidden"></div>

            <!-- Main Drive Stage -->
            <div id="media-browser-container"></div>
          </main>
        </div>

        <!-- Auth & Shortcuts Modal Containers -->
        <div id="auth-modal-container"></div>
        <div id="shortcuts-modal-container"></div>
      </div>
    `;

    // Populate Header Icons safely
    const setIcon = (sel, def, size = 15) => {
      const el = this.root.querySelector(sel);
      if (el) {
        while (el.firstChild) el.removeChild(el.firstChild);
        el.appendChild(createIcon(def, { size }));
      }
    };

    setIcon(".toggle-icon-holder", Icons.PanelLeft, 16);
    setIcon(".brand-logo-icon", Icons.HardDrive, 16);
    setIcon("#search-icon-holder", Icons.Search, 14);
    setIcon(".clear-icon-holder", Icons.X, 14);
    setIcon(".keyboard-icon-holder", Icons.Keyboard, 14);
  }

  initComponents() {
    const sidebarContainer = this.root.querySelector("#sidebar-container");
    const toggleSidebarBtn = this.root.querySelector("#btn-toggle-sidebar");
    const searchInput = this.root.querySelector("#header-global-search");
    const searchClear = this.root.querySelector("#header-search-clear");

    // Sidebar Minimize / Toggle Handler
    toggleSidebarBtn.onclick = () => {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      sidebarContainer.classList.toggle("collapsed", this.sidebarCollapsed);
      
      const holder = this.root.querySelector(".toggle-icon-holder");
      if (holder) {
        while (holder.firstChild) holder.removeChild(holder.firstChild);
        holder.appendChild(
          createIcon(this.sidebarCollapsed ? Icons.PanelLeft : Icons.PanelLeftClose, { size: 16 })
        );
      }
    };

    // Header Global Search Handler
    searchInput.oninput = (e) => {
      const q = e.target.value.trim();
      searchClear.classList.toggle("hidden", !q);
      if (this.mediaBrowser) {
        this.mediaBrowser.setSearchQuery(q);
      }
    };

    searchClear.onclick = () => {
      searchInput.value = "";
      searchClear.classList.add("hidden");
      if (this.mediaBrowser) {
        this.mediaBrowser.setSearchQuery("");
      }
    };

    // 1. Auth & Shortcuts Modals
    this.authModal = new AuthModal(
      this.root.querySelector("#auth-modal-container"),
      (selectedChannelIds) => this.onWizardComplete(selectedChannelIds)
    );

    this.shortcutsModal = new ShortcutsModal(
      this.root.querySelector("#shortcuts-modal-container")
    );

    const tgStatusBtn = this.root.querySelector("#tg-status-btn");
    tgStatusBtn.onclick = () => this.authModal.show(1);

    const shortcutsHelpBtn = this.root.querySelector("#shortcuts-help-btn");
    if (shortcutsHelpBtn) {
      shortcutsHelpBtn.onclick = () => this.shortcutsModal.toggle();
    }

    // Listen to TG Client status updates
    tgStreamClient.onStatusChange((status) => {
      const dot = this.root.querySelector("#header-status-dot");
      const text = this.root.querySelector("#header-status-text");
      if (status.isConnected) {
        dot.className = "status-dot connected";
        text.textContent = status.user?.username ? `@${status.user.username}` : "TG Connected";
      } else if (status.isConnecting) {
        dot.className = "status-dot connecting";
        text.textContent = "Connecting...";
      } else {
        dot.className = "status-dot disconnected";
        text.textContent = "Disconnected";
      }
    });

    // 2. Retained Video Player
    this.player = new VideoPlayer(
      this.root.querySelector("#player-container"),
      () => {},
      () => {}
    );

    // 3. Media Browser (Drive Grid/List Explorer)
    this.mediaBrowser = new MediaBrowser(this.root.querySelector("#media-browser-container"), {
      onPlayMedia: (item) => this.playMedia(item),
      onTriggerUpload: () => this.triggerUpload(),
    });

    // 4. Dual-Zone Sidebar
    this.sidebar = new Sidebar(sidebarContainer, {
      onOpenWizard: () => this.authModal.show(2),
      onLogout: () => this.handleLogout(),
    });
  }

  async loadUserData() {
    const hasSession = !!getSavedSession();

    if (!hasSession) {
      this.authModal.show(1);
      return;
    }

    try {
      const connected = await tgStreamClient.init().catch((e) => {
        console.log("TG auto-init notice:", e);
        return false;
      });

      if (!connected) {
        this.authModal.show(1);
        return;
      }

      // If user hasn't completed Channel Selection Wizard (Step 2), open it
      if (vaultStore.selectedChannelIds.length === 0) {
        this.authModal.show(2);
        return;
      }

      await this.syncUserVaults(vaultStore.selectedChannelIds);
    } catch (err) {
      console.error("Error initializing user data:", err);
      this.authModal.show(1);
    }
  }

  async syncUserVaults(selectedIds = null) {
    try {
      const { publicChannels, privateChannels } = await tgStreamClient.getUserChannels();
      const allChannels = [...publicChannels, ...privateChannels];
      vaultStore.setChannels(allChannels);

      const targetIds = selectedIds && selectedIds.length > 0 ? selectedIds : allChannels.map(c => c.id);

      // Preload media for selected channels
      for (const chId of targetIds.slice(0, 10)) {
        this.loadChannelMedia(chId).catch((e) => console.log(`Load channel ${chId} notice:`, e));
      }
    } catch (err) {
      console.error("Error syncing channels:", err);
    }
  }

  async loadChannelMedia(channelId) {
    if (vaultStore.channelMediaCache.has(String(channelId))) return;

    try {
      const items = await tgStreamClient.getChannelMediaMessages(channelId, 100);
      vaultStore.cacheChannelItems(channelId, items);
    } catch (err) {
      if (err.message && err.message.includes("FLOOD_WAIT_")) {
        const match = err.message.match(/FLOOD_WAIT_(\d+)/);
        const waitSec = match ? parseInt(match[1], 10) : 30;
        vaultStore.setRateLimit(waitSec);
      }
      console.error(`Failed to fetch media for channel ${channelId}:`, err);
    }
  }

  playMedia(item) {
    if (item.category === "videos" || item.category === "audio") {
      this.player.loadMedia(item, true);
    }
  }

  triggerUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = (e) => {
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        alert(`Selected ${file.name} (${(file.size / 1024).toFixed(1)} KB) for upload to active channel.`);
      }
    };
    input.click();
  }

  async handleLogout() {
    if (confirm("Are you sure you want to log out and clear all saved credentials and indexed drive cache?")) {
      await tgStreamClient.destroy();
      await clearSavedSession();
      localStorage.removeItem("televault_selected_channels");
      localStorage.removeItem("televault_custom_folders");
      localStorage.removeItem("televault_pinned_ids");
      localStorage.removeItem("televault_favorite_ids");
      window.location.reload();
    }
  }

  async onWizardComplete(selectedChannels = []) {
    await this.syncUserVaults(selectedChannels);
  }

  bindGlobalShortcuts() {
    window.addEventListener("keydown", (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
      if (activeTag === "input" || activeTag === "textarea") return;

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        if (this.shortcutsModal) this.shortcutsModal.toggle();
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        const searchInp = this.root.querySelector("#header-global-search");
        if (searchInp) {
          searchInp.focus();
          searchInp.select();
        }
      }
    });
  }
}
