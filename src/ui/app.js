import { vaultStore } from "../catalog/vaultStore.js";
import { VideoPlayer } from "../player/player.js";
import { Sidebar } from "./sidebar.js";
import { MediaBrowser } from "./mediaBrowser.js";
import { AuthModal } from "./authModal.js";
import { ShortcutsModal } from "./shortcutsModal.js";
import { tgStreamClient } from "../telegram/client.js";
import { getSavedSession } from "../telegram/session.js";
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
            <div class="app-brand-name">Vaultgram</div>
          </div>

          <!-- Centered Global Search Input -->
          <div class="header-search-container">
            <span class="header-search-icon" id="search-icon-holder"></span>
            <input 
              type="text" 
              class="header-search-input" 
              id="header-global-search" 
              placeholder="Search all files, documents, and videos across channels (/)..."
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

        <!-- Main Body: Sidebar + Main Content Grid Stage -->
        <div class="app-body">
          <!-- Sidebar Container (Channels Only) -->
          <div class="sidebar-container" id="sidebar-container"></div>

          <!-- Main Content Stage (Folders & Files Grid Explorer) -->
          <main class="content-stage">
            <!-- Video Player is retained in code and can be mounted dynamically when needed -->
            <div id="player-container" class="hidden"></div>

            <!-- Media Explorer (Folders & Files Grid) -->
            <div id="media-browser-container"></div>
          </main>
        </div>

        <!-- Auth & Shortcuts Modal Containers -->
        <div id="auth-modal-container"></div>
        <div id="shortcuts-modal-container"></div>
      </div>
    `;

    // Populate Lucide Icons safely into DOM
    const toggleIconHolder = this.root.querySelector(".toggle-icon-holder");
    if (toggleIconHolder) toggleIconHolder.appendChild(createIcon(Icons.PanelLeft, { size: 16 }));

    const searchIconHolder = this.root.querySelector("#search-icon-holder");
    if (searchIconHolder) searchIconHolder.appendChild(createIcon(Icons.Search, { size: 14 }));

    const clearIconHolder = this.root.querySelector(".clear-icon-holder");
    if (clearIconHolder) clearIconHolder.appendChild(createIcon(Icons.X, { size: 14 }));

    const keyboardIconHolder = this.root.querySelector(".keyboard-icon-holder");
    if (keyboardIconHolder) keyboardIconHolder.appendChild(createIcon(Icons.Keyboard, { size: 14 }));
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
      (selectedChannels) => this.onAuthSuccess(selectedChannels)
    );

    this.shortcutsModal = new ShortcutsModal(
      this.root.querySelector("#shortcuts-modal-container")
    );

    const tgStatusBtn = this.root.querySelector("#tg-status-btn");
    tgStatusBtn.onclick = () => this.authModal.show();

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

    // 2. Retained Video Player (hidden in background)
    this.player = new VideoPlayer(
      this.root.querySelector("#player-container"),
      () => {},
      () => {}
    );

    // 3. Media Browser (Folders + Files Grid Explorer)
    this.mediaBrowser = new MediaBrowser(this.root.querySelector("#media-browser-container"), {
      onPlayMedia: (item) => {
        this.playMedia(item);
      },
    });

    // 4. Sidebar (Channels Only)
    this.sidebar = new Sidebar(sidebarContainer, {
      onChannelChange: async (channelId) => {
        if (channelId !== "all") {
          await this.loadChannelMedia(channelId);
        }
      },
    });
  }

  async loadUserData() {
    const hasSession = !!getSavedSession();

    if (!hasSession) {
      this.authModal.show();
      return;
    }

    try {
      const connected = await tgStreamClient.init().catch((e) => {
        console.log("TG auto-init notice:", e);
        return false;
      });

      if (!connected) {
        this.authModal.show();
        return;
      }

      await this.syncUserVaults();
    } catch (err) {
      console.error("Error initializing user data:", err);
      this.authModal.show();
    }
  }

  async syncUserVaults(selectedIds = null) {
    try {
      const { publicChannels, privateChannels } = await tgStreamClient.getUserChannels();
      const allChannels = [...publicChannels, ...privateChannels];

      let filteredChannels = allChannels;
      if (selectedIds && selectedIds.length > 0) {
        filteredChannels = allChannels.filter((c) => selectedIds.includes(c.id));
      }

      vaultStore.setChannels(filteredChannels);

      // Preload the first few channels into the cache
      const preloads = filteredChannels.slice(0, 5);
      for (const ch of preloads) {
        this.loadChannelMedia(ch.id).catch((e) => console.log(`Load channel ${ch.id} notice:`, e));
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
      console.error(`Failed to fetch media for channel ${channelId}:`, err);
    }
  }

  playMedia(item) {
    if (item.category === "videos" || item.category === "audio") {
      this.player.loadMedia(item, true);
    }
  }

  async onAuthSuccess(selectedChannels = []) {
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
