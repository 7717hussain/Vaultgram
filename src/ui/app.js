import { catalogStore } from "../catalog/catalogStore.js";
import { VideoPlayer } from "../player/player.js";
import { Sidebar } from "./sidebar.js";
import { LectureList } from "./lectureList.js";
import { AuthModal } from "./authModal.js";
import { ShortcutsModal } from "./shortcutsModal.js";
import { tgStreamClient } from "../telegram/client.js";

export class App {
  constructor(rootEl) {
    this.root = rootEl;
    this.player = null;
    this.sidebar = null;
    this.lectureList = null;
    this.authModal = null;
    this.shortcutsModal = null;
    this.currentLectureList = [];
    this.currentLectureIndex = -1;

    this.renderLayout();
    this.initComponents();
    this.bindGlobalShortcuts();
    this.loadData();
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
            <div class="header-stats" id="header-stats">Loading catalog...</div>
          </div>

          <div class="header-right">
            <!-- Shortcuts Help Button -->
            <button class="tg-status-btn" id="shortcuts-help-btn" title="Keyboard Shortcuts (?)">
              <span>⌨️ Hotkeys</span>
            </button>

            <!-- Connection Status Badge -->
            <button class="tg-status-btn" id="tg-status-btn" title="Telegram Connection Status">
              <span class="status-dot disconnected" id="header-status-dot"></span>
              <span id="header-status-text">Connecting...</span>
            </button>
          </div>
        </header>

        <!-- Main Body: Sidebar + Player & Lectures Area -->
        <div class="app-body">
          <!-- Sidebar Container -->
          <div class="sidebar-container" id="sidebar-container"></div>

          <!-- Main Content Stage -->
          <main class="content-stage">
            <!-- Video Player Area -->
            <section class="player-section" id="player-container"></section>

            <!-- Chapter Lectures Browser -->
            <section class="lectures-section" id="lectures-container"></section>
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
      () => this.onAuthSuccess()
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
      () => this.playNextLecture(),
      () => this.playPrevLecture()
    );

    // 3. Lecture List
    this.lectureList = new LectureList(this.root.querySelector("#lectures-container"), {
      onPlayLecture: (lec) => {
        this.playLecture(lec);
      },
    });

    // 4. Sidebar
    this.sidebar = new Sidebar(this.root.querySelector("#sidebar-container"), {
      onSelectChapter: (chapter, batch, subject, autoPlayItemId) => {
        this.currentLectureList = chapter.lectures;
        this.lectureList.setChapter(chapter, batch, subject, autoPlayItemId);
      },
      onSelectSearchResult: (query, callback) => {
        const results = catalogStore.search(query);
        callback(results);
      },
    });
  }

  async loadData() {
    try {
      const catalog = await catalogStore.load();
      this.sidebar.setData(catalog.batches);

      const stats = catalogStore.getStats();
      this.root.querySelector("#header-stats").textContent = `${stats.totalLectures} Video Lectures &bull; 100% Free MTProto`;

      // Check if session exists; if not, immediately present the login page
      const hasSession = !!getSavedSession();
      if (!hasSession) {
        this.authModal.show();
      } else {
        const connected = await tgStreamClient.init().catch((e) => {
          console.log("TG auto-init notice:", e);
          return false;
        });
        if (!connected) {
          this.authModal.show();
        }
      }
    } catch (err) {
      console.error("Error loading catalog:", err);
      this.root.querySelector("#header-stats").textContent = "Error loading catalog.json";
    }
  }

  playLecture(lec) {
    this.player.loadLecture(lec, true);
    this.lectureList.setPlayingId(lec.id);
    this.currentLectureIndex = this.currentLectureList.findIndex((l) => l.id === lec.id);
  }

  playNextLecture() {
    if (this.currentLectureIndex >= 0 && this.currentLectureIndex < this.currentLectureList.length - 1) {
      const nextLec = this.currentLectureList[this.currentLectureIndex + 1];
      this.playLecture(nextLec);
    }
  }

  playPrevLecture() {
    if (this.currentLectureIndex > 0) {
      const prevLec = this.currentLectureList[this.currentLectureIndex - 1];
      this.playLecture(prevLec);
    }
  }

  onAuthSuccess() {
    console.log("Telegram client authenticated successfully.");
  }

  bindGlobalShortcuts() {
    window.addEventListener("keydown", (e) => {
      // Don't trigger shortcuts when user is typing in input fields
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
        if (vds) vds.currentTime = Math.max(0, (vds.currentTime || 0) - 10);
        return;
      }

      if (key === "l" || e.key === "ArrowRight") {
        e.preventDefault();
        const vds = this.player?.player;
        if (vds) vds.currentTime = Math.min(vds.duration || 0, (vds.currentTime || 0) + 10);
        return;
      }

      if (key === "f") {
        e.preventDefault();
        const vds = this.player?.player;
        if (vds) {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else vds.requestFullscreen().catch(() => {});
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
        this.playNextLecture();
        return;
      }

      if (key === "p") {
        e.preventDefault();
        this.playPrevLecture();
        return;
      }
    });
  }
}
