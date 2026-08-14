import { vaultStore } from "../catalog/vaultStore.js";
import { ProgressTracker } from "../player/progressTracker.js";
import { tgStreamClient } from "../telegram/client.js";

export class MediaBrowser {
  constructor(containerEl, { onPlayMedia }) {
    this.container = containerEl;
    this.onPlayMedia = onPlayMedia;
    this.searchQuery = "";
    this.currentlyPlayingId = null;

    this.render();
    vaultStore.onChange(() => this.updateView());
  }

  setSearchQuery(q) {
    this.searchQuery = q;
    this.updateView();
  }

  setPlayingId(id) {
    this.currentlyPlayingId = id;
    this.updatePlayingState();
  }

  render() {
    this.container.innerHTML = `
      <div class="lecture-list-wrapper">
        <!-- Section Header Info -->
        <div class="chapter-header-banner">
          <div class="chapter-breadcrumbs" id="browser-breadcrumb">
            Vaultgram / Unified View
          </div>
          <div class="chapter-title-row">
            <h2 class="chapter-title-main" id="browser-title">All Files</h2>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="chapter-count-badge" id="browser-count">0 items</span>
            </div>
          </div>
        </div>

        <!-- Media List Scroll Area -->
        <div class="items-scroll-area" id="media-items-container">
          <div class="items-empty">Select or load a Telegram channel to explore media files.</div>
        </div>
      </div>
    `;
  }

  updatePlayingState() {
    const cards = this.container.querySelectorAll(".lecture-card");
    cards.forEach((card) => {
      const isPlaying = card.dataset.id === this.currentlyPlayingId;
      card.classList.toggle("playing", isPlaying);
    });
  }

  updateView() {
    const titleEl = this.container.querySelector("#browser-title");
    const breadcrumbEl = this.container.querySelector("#browser-breadcrumb");
    const countEl = this.container.querySelector("#browser-count");
    const itemsContainer = this.container.querySelector("#media-items-container");

    const channelName =
      vaultStore.activeChannelId === "all"
        ? "Unified View (All Channels)"
        : vaultStore.channels.find((c) => c.id === vaultStore.activeChannelId)?.title || "Channel";

    const filterName = vaultStore.activeCustomFolder
      ? `Folder: ${vaultStore.activeCustomFolder}`
      : `Category: ${vaultStore.activeCategory.toUpperCase()}`;

    breadcrumbEl.textContent = `Vaultgram / ${channelName}`;
    titleEl.textContent = vaultStore.activeCustomFolder
      ? `${vaultStore.activeCustomFolder} Files`
      : `${vaultStore.activeCategory.charAt(0).toUpperCase() + vaultStore.activeCategory.slice(1)} Explorer`;

    const items = vaultStore.getFilteredItems(this.searchQuery);
    countEl.textContent = `${items.length} files`;

    if (items.length === 0) {
      itemsContainer.innerHTML = `
        <div class="items-empty">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 8px auto; display: block; opacity: 0.5;"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24"/></svg>
          No media files found in this view.
        </div>
      `;
      return;
    }

    itemsContainer.innerHTML = items
      .map((item) => {
        const isPlaying = item.id === this.currentlyPlayingId;
        const progressData = ProgressTracker.get(item.id);
        const hasProgress = progressData && progressData.currentTime > 0;
        const percent = progressData ? progressData.percent : 0;
        const isDone = progressData && progressData.completed;

        const iconSvg = this.getItemIcon(item.category);

        return `
          <div class="lecture-card ${isPlaying ? "playing" : ""}" data-id="${item.id}">
            <div class="card-play-icon">
              ${iconSvg}
            </div>

            <div class="card-info">
              <span class="card-title" title="${this.escapeHtml(item.fileName)}">${this.escapeHtml(item.fileName)}</span>
              <div class="card-meta">
                <span>${this.formatBytes(item.size)}</span>
                <span>&bull;</span>
                <span style="text-transform: uppercase;">${item.category}</span>
                ${hasProgress ? `<span>&bull;</span><span class="resume-hint">Resume (${Math.round(percent)}%)</span>` : ""}
              </div>
              ${hasProgress ? `
                <div class="card-progress-bar">
                  <div class="card-progress-fill" style="width: ${percent}%"></div>
                </div>
              ` : ""}
            </div>

            <div class="card-actions">
              ${isDone ? `<span class="badge-done">&#10003; Done</span>` : ""}
              <button class="lec-download-btn" data-download-id="${item.id}" title="Download from Telegram MTProto">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span>Save</span>
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    // Bind click to play / view
    itemsContainer.querySelectorAll(".lecture-card").forEach((card) => {
      card.onclick = (e) => {
        if (e.target.closest(".lec-download-btn")) return;
        const id = card.dataset.id;
        const item = items.find((i) => i.id === id);
        if (item && this.onPlayMedia) {
          this.onPlayMedia(item);
        }
      };
    });

    // Bind Download buttons
    itemsContainer.querySelectorAll(".lec-download-btn").forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const id = btn.dataset.downloadId;
        const item = items.find((i) => i.id === id);
        if (item) {
          await this.downloadItem(item, btn);
        }
      };
    });
  }

  getItemIcon(category) {
    switch (category) {
      case "videos":
        return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      case "archives":
        return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
      case "audio":
        return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
      case "images":
        return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
      default:
        return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    }
  }

  async downloadItem(item, btnEl) {
    const originalContent = btnEl.innerHTML;
    btnEl.disabled = true;
    btnEl.innerHTML = `<span class="download-spinner"></span> 0%`;

    try {
      const chunkSize = 512 * 1024;
      const chunks = [];
      let downloaded = 0;

      while (downloaded < item.size) {
        const limit = Math.min(chunkSize, item.size - downloaded);
        const chunk = await tgStreamClient.fetchChunk(
          item.channelId,
          item.messageId,
          downloaded,
          limit
        );

        if (!chunk || chunk.length === 0) break;
        chunks.push(chunk);
        downloaded += chunk.length;

        const progress = Math.min(100, Math.round((downloaded / item.size) * 100));
        btnEl.innerHTML = `<span class="download-spinner"></span> ${progress}%`;
      }

      const blob = new Blob(chunks, { type: item.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.fileName.replace(/[/\\?%*:|"<>]/g, "_");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      btnEl.innerHTML = `&#10003; Saved`;
      setTimeout(() => {
        btnEl.disabled = false;
        btnEl.innerHTML = originalContent;
      }, 3000);
    } catch (err) {
      console.error("Download error:", err);
      btnEl.disabled = false;
      btnEl.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Failed`;
      setTimeout(() => {
        btnEl.innerHTML = originalContent;
      }, 3000);
    }
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
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
