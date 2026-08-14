import { vaultStore } from "../catalog/vaultStore.js";
import { VideoPlayer } from "../player/player.js";
import { Sidebar } from "./sidebar.js";
import { MediaBrowser } from "./mediaBrowser.js";
import { AuthModal } from "./authModal.js";
import { ShortcutsModal } from "./shortcutsModal.js";
import { tgStreamClient } from "../telegram/client.js";
import { getSavedSession } from "../telegram/session.js";

export class App {
  constructor(rootEl) {
    this.root = rootEl;
    this.player = null;
    this.sidebar = null;
    this.mediaBrowser = null;
    this.authModal = null;
    this.shortcutsModal = null;
    this.currentPlayingIndex = -1;

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
            <div class="app-logo">
              <span class="logo-symbol">&#x25B6;</span>
              <span class="logo-text">Vaultgram</span>
            </div>
            <div class="header-stats" id="header-stats">Loading Telegram Vaults...</div>
          </div>

          <div class="header-right">
            <!-- Shortcuts Help Button -->
            <button class="tg-status-btn" id="shortcuts-help-btn" title="Keyboard Shortcuts (?)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="8"/><line x1="10" y1="8" x2="10" y2="8"/><line x1="14" y1="8" x2="14" y2="8"/><line x1="18" y1="8" x2="18" y2="8"/><line x1="6" y1="12" x2="6" y2="12"/><line x1="10" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="14" y2="12"/><line x1="18" y1="12" x2="18" y2="12"/><line x1="7" y1="16" x2="17" y2="16"/></svg>
              <span>Hotkeys</span>
            </button>

            <!-- Connection Status Badge -->
            <button class="tg-status-btn" id="tg-status-btn" title="Telegram Connection Status">
              <span class="status-dot disconnected" id="header-status-dot"></span>
              <span id="header-status-text">Connecting...</span>
            </button>
          </div>
        </header>

        <!-- Main Body: Sidebar + Player & Media Explorer Area -->
        <div class="app-body">
          <!-- Sidebar Container -->
          <div class="sidebar-container" id="sidebar-container"></div>

          <!-- Main Content Stage -->
          <main class="content-stage">
            <!-- Video Player Area -->
            <section class="player-section" id="player-container"></section>

            <!-- Media Browser & Explorer -->
            <section class="lectures-section" id="media-browser-container"></section>
          </main>
        </div>

        <!-- Auth & Shortcuts Modal Containers -->
        <div id="auth-modal-container"></div>
        <div id="shortcuts-modal-container"></div>
      </div>
    `;
  }

  initComponents() {
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

    // 2. Video Player
    this.player = new VideoPlayer(
      this.root.querySelector("#player-container"),
      () => this.playNextMedia(),
      () => this.playPrevMedia()
    );

    // 3. Media Browser
    this.mediaBrowser = new MediaBrowser(this.root.querySelector("#media-browser-container"), {
      onPlayMedia: (item) => {
        this.playMedia(item);
      },
    });

    // 4. Dynamic Sidebar
    this.sidebar = new Sidebar(this.root.querySelector("#sidebar-container"), {
      onSelectItem: ({ type, query }) => {
        if (type === "search") {
          this.mediaBrowser.setSearchQuery(query);
        }
      },
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
      this.root.querySelector("#header-stats").textContent = "Please sign in to Telegram";
      return;
    }

    try {
      const connected = await tgStreamClient.init().catch((e) => {
        console.log("TG auto-init notice:", e);
        return false;
      });

      if (!connected) {
        this.authModal.show();
        this.root.querySelector("#header-stats").textContent = "Session expired or invalid";
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
      this.root.querySelector("#header-stats").textContent = "Discovering channels...";
      const { publicChannels, privateChannels } = await tgStreamClient.getUserChannels();
      const allChannels = [...publicChannels, ...privateChannels];

      let filteredChannels = allChannels;
      if (selectedIds && selectedIds.length > 0) {
        filteredChannels = allChannels.filter((c) => selectedIds.includes(c.id));
      }

      vaultStore.setChannels(filteredChannels);

      this.root.querySelector("#header-stats").textContent = `${filteredChannels.length} Channels Synced • 100% Client-Side`;

      // Preload the first few channels into the cache
      const preloads = filteredChannels.slice(0, 5);
      for (const ch of preloads) {
        this.loadChannelMedia(ch.id).catch((e) => console.log(`Load channel ${ch.id} notice:`, e));
      }
    } catch (err) {
      console.error("Error syncing channels:", err);
      this.root.querySelector("#header-stats").textContent = "Error discovering channels";
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
    this.player.loadMedia(item, true);
    this.mediaBrowser.setPlayingId(item.id);
    const list = vaultStore.getFilteredItems();
    this.currentPlayingIndex = list.findIndex((i) => i.id === item.id);
  }

  playNextMedia() {
    const list = vaultStore.getFilteredItems();
    if (this.currentPlayingIndex >= 0 && this.currentPlayingIndex < list.length - 1) {
      this.playMedia(list[this.currentPlayingIndex + 1]);
    }
  }

  playPrevMedia() {
    const list = vaultStore.getFilteredItems();
    if (this.currentPlayingIndex > 0) {
      this.playMedia(list[this.currentPlayingIndex - 1]);
    }
  }

  async onAuthSuccess(selectedChannels = []) {
    console.log("Auth success callback triggered.");
    await this.syncUserVaults(selectedChannels);
  }

  bindGlobalShortcuts() {
    window.addEventListener("keydown", (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
      if (activeTag === "input" || activeTag === "textarea") return;

      const key = e.key.toLowerCase();

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        if (this.shortcutsModal) this.shortcutsModal.toggle();
        return;
      }

      if (key === "k" || e.key === " ") {
        e.preventDefault();
        const vds = this.player?.player;
        if (vds) {
          if (vds.paused) vds.play();
          else vds.pause();
        }
        return;
      }

      if (key === "j" || e.key === "ArrowLeft") {
        e.preventDefault();
        const vds = this.player?.player;
        if (vds) vds.currentTime = Math.max(0, vds.currentTime - 10);
        return;
      }

      if (key === "l" || e.key === "ArrowRight") {
        e.preventDefault();
        const vds = this.player?.player;
        if (vds) vds.currentTime = Math.min(vds.duration || 0, vds.currentTime + 10);
        return;
      }

      if (key === "f") {
        e.preventDefault();
        const vds = this.player?.player;
        if (vds) {
          if (vds.fullscreen) vds.exitFullscreen();
          else vds.enterFullscreen();
        }
        return;
      }

      if (key === "m") {
        e.preventDefault();
        const vds = this.player?.player;
        if (vds) vds.muted = !vds.muted;
        return;
      }

      if (key === "n") {
        e.preventDefault();
        this.playNextMedia();
        return;
      }

      if (key === "p") {
        e.preventDefault();
        this.playPrevMedia();
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        const searchInp = this.root.querySelector("#global-search-input");
        if (searchInp) {
          searchInp.focus();
          searchInp.select();
        }
      }
    });
  }
}
