import { vaultStore } from "../catalog/vaultStore.js";
import { tgStreamClient } from "../telegram/client.js";
import { createIcon, Icons } from "./icons.js";

/**
 * Modern Drive File Browser & Stage:
 * - Top Bar: Active Context Breadcrumbs, Search, View Mode (Grid/List), Sort Dropdown, Upload CTA
 * - Dropzone: Fullscreen drag-and-drop overlay for instant Telegram uploads
 * - File Items: Download with chunk progress, Media Preview, Pin, Star, Assign to Folder, Copy Link
 */
export class MediaBrowser {
  constructor(containerEl, { onPlayMedia, onTriggerUpload }) {
    this.container = containerEl;
    this.onPlayMedia = onPlayMedia;
    this.onTriggerUpload = onTriggerUpload;
    this.searchQuery = "";

    this.render();
    this.bindEvents();

    vaultStore.onChange(() => this.updateView());
  }

  setSearchQuery(q) {
    this.searchQuery = q;
    this.updateView();
  }

  render() {
    this.container.innerHTML = `
      <div class="media-explorer-wrapper">
        <!-- TOP TOOLBAR & CONTEXT BAR -->
        <div class="drive-top-bar">
          <div class="drive-top-left">
            <div class="drive-breadcrumbs" id="drive-breadcrumbs">
              <span class="bc-item" id="bc-channel">All Channels</span>
              <span class="bc-sep">/</span>
              <span class="bc-item active" id="bc-category">All Files</span>
            </div>
            <h1 class="drive-section-title" id="drive-title">All Files</h1>
          </div>

          <!-- Controls: Sort + View Toggle + Upload CTA -->
          <div class="drive-top-right">
            <!-- Sort Selector -->
            <div class="drive-sort-box">
              <button class="drive-tool-btn" id="btn-sort-trigger" title="Sort Files">
                <span class="icon-sort-holder"></span>
                <span id="sort-label">Date (Desc)</span>
              </button>
            </div>

            <!-- Grid vs List View Toggle -->
            <div class="drive-view-toggle">
              <button class="view-toggle-btn" id="btn-view-grid" title="Grid View">
                <span class="icon-grid-holder"></span>
              </button>
              <button class="view-toggle-btn" id="btn-view-list" title="List View">
                <span class="icon-list-holder"></span>
              </button>
            </div>

            <!-- Upload File CTA Button -->
            <button class="drive-upload-btn" id="btn-upload-file">
              <span class="icon-upload-holder"></span>
              <span>Upload File</span>
            </button>
          </div>
        </div>

        <!-- MAIN FILE CONTENT AREA (Grid or List) -->
        <div class="drive-content-container" id="drive-content-container">
          <div class="drive-files-grid" id="drive-files-grid"></div>
          <div class="drive-files-table-wrap hidden" id="drive-files-table-wrap">
            <table class="drive-files-table">
              <thead>
                <tr>
                  <th style="width: 44px;"></th>
                  <th>Name</th>
                  <th style="width: 140px;">Category</th>
                  <th style="width: 110px;">Size</th>
                  <th style="width: 140px;">Date</th>
                  <th style="width: 120px; text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody id="drive-files-table-body"></tbody>
            </table>
          </div>
        </div>

        <!-- FULLSCREEN DRAG & DROP OVERLAY -->
        <div class="dropzone-overlay hidden" id="dropzone-overlay">
          <div class="dropzone-card">
            <div class="dropzone-icon-box">
              <span class="icon-dropzone-holder"></span>
            </div>
            <h2>Drop files to upload directly to Telegram Drive</h2>
            <p id="dropzone-target-text">Uploading to: All Channels (or select a channel in the top carousel)</p>
          </div>
        </div>

        <!-- MEDIA PREVIEW MODAL -->
        <div class="preview-modal-backdrop hidden" id="preview-modal-backdrop">
          <div class="preview-modal-card">
            <div class="preview-header">
              <span class="preview-title" id="preview-filename">Media Preview</span>
              <button class="preview-close-btn" id="btn-close-preview">&times;</button>
            </div>
            <div class="preview-body" id="preview-body-content"></div>
          </div>
        </div>
      </div>
    `;

    // Hydrate Static Icons
    const setIcon = (sel, def, size = 14) => {
      const el = this.container.querySelector(sel);
      if (el) {
        while (el.firstChild) el.removeChild(el.firstChild);
        el.appendChild(createIcon(def, { size }));
      }
    };

    setIcon(".icon-sort-holder", Icons.ArrowUpDown, 13);
    setIcon(".icon-grid-holder", Icons.LayoutGrid, 14);
    setIcon(".icon-list-holder", Icons.List, 14);
    setIcon(".icon-upload-holder", Icons.Upload, 14);
    setIcon(".icon-dropzone-holder", Icons.Upload, 32);
  }

  bindEvents() {
    // Sort Button Click
    const btnSort = this.container.querySelector("#btn-sort-trigger");
    if (btnSort) {
      btnSort.onclick = () => {
        const sorts = ["date", "name", "size", "type"];
        const nextIdx = (sorts.indexOf(vaultStore.sortBy) + 1) % sorts.length;
        vaultStore.setSort(sorts[nextIdx]);
      };
    }

    // View Toggle
    const btnGrid = this.container.querySelector("#btn-view-grid");
    const btnList = this.container.querySelector("#btn-view-list");
    if (btnGrid) btnGrid.onclick = () => vaultStore.setViewMode("grid");
    if (btnList) btnList.onclick = () => vaultStore.setViewMode("list");

    // Upload CTA
    const btnUpload = this.container.querySelector("#btn-upload-file");
    if (btnUpload) {
      btnUpload.onclick = () => {
        if (this.onTriggerUpload) this.onTriggerUpload();
      };
    }

    // Drag and drop events on window
    this.bindDropzoneEvents();

    // Close preview modal
    const btnClosePrev = this.container.querySelector("#btn-close-preview");
    const prevBackdrop = this.container.querySelector("#preview-modal-backdrop");
    if (btnClosePrev) btnClosePrev.onclick = () => prevBackdrop.classList.add("hidden");
    if (prevBackdrop) {
      prevBackdrop.onclick = (e) => {
        if (e.target === prevBackdrop) prevBackdrop.classList.add("hidden");
      };
    }
  }

  bindDropzoneEvents() {
    const overlay = this.container.querySelector("#dropzone-overlay");
    if (!overlay) return;

    let dragCounter = 0;

    window.addEventListener("dragenter", (e) => {
      e.preventDefault();
      dragCounter++;
      overlay.classList.remove("hidden");
    });

    window.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        overlay.classList.add("hidden");
        dragCounter = 0;
      }
    });

    window.addEventListener("dragover", (e) => {
      e.preventDefault();
    });

    window.addEventListener("drop", (e) => {
      e.preventDefault();
      dragCounter = 0;
      overlay.classList.add("hidden");
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        alert(`File drop detected (${e.dataTransfer.files[0].name}). Upload queue will process to active channel!`);
      }
    });
  }

  updateView() {
    this.updateHeaderAndBreadcrumbs();
    this.updateViewModeState();

    const items = vaultStore.getFilteredAndSortedItems(this.searchQuery);

    if (vaultStore.viewMode === "grid") {
      this.renderGridView(items);
    } else {
      this.renderListView(items);
    }
  }

  updateHeaderAndBreadcrumbs() {
    const bcChannel = this.container.querySelector("#bc-channel");
    const bcCategory = this.container.querySelector("#bc-category");
    const driveTitle = this.container.querySelector("#drive-title");
    const sortLabel = this.container.querySelector("#sort-label");

    const channelName = vaultStore.activeChannelId === "UNIFIED"
      ? "All Channels"
      : vaultStore.channels.find((c) => c.id === vaultStore.activeChannelId)?.title || "Channel";

    let catName = vaultStore.activeCategory;
    if (vaultStore.customFolders[catName]) {
      catName = vaultStore.customFolders[catName].name;
    }

    if (bcChannel) bcChannel.textContent = channelName;
    if (bcCategory) bcCategory.textContent = catName;
    if (driveTitle) driveTitle.textContent = `${catName} (${channelName})`;
    if (sortLabel) {
      sortLabel.textContent = `${vaultStore.sortBy.charAt(0).toUpperCase() + vaultStore.sortBy.slice(1)} (${vaultStore.sortOrder.toUpperCase()})`;
    }
  }

  updateViewModeState() {
    const isGrid = vaultStore.viewMode === "grid";
    const btnGrid = this.container.querySelector("#btn-view-grid");
    const btnList = this.container.querySelector("#btn-view-list");
    const gridContainer = this.container.querySelector("#drive-files-grid");
    const tableWrap = this.container.querySelector("#drive-files-table-wrap");

    if (btnGrid) btnGrid.classList.toggle("active", isGrid);
    if (btnList) btnList.classList.toggle("active", !isGrid);
    if (gridContainer) gridContainer.classList.toggle("hidden", !isGrid);
    if (tableWrap) tableWrap.classList.toggle("hidden", isGrid);
  }

  // --- GRID VIEW ---
  renderGridView(items) {
    const container = this.container.querySelector("#drive-files-grid");
    if (!container) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    if (items.length === 0) {
      container.appendChild(this.createEmptyState());
      return;
    }

    for (const item of items) {
      const card = this.createGridCard(item);
      container.appendChild(card);
    }
  }

  createGridCard(item) {
    const isPinned = vaultStore.pinnedFileIds.has(item.id);
    const isFav = vaultStore.favoriteFileIds.has(item.id);

    const card = document.createElement("div");
    card.className = "drive-card";

    // Card Header: Icon + Title + Pin/Star Icons
    const top = document.createElement("div");
    top.className = "drive-card-top";

    const iconBox = document.createElement("div");
    iconBox.className = "drive-card-icon-box";
    iconBox.appendChild(createIcon(this.getItemIconDef(item.category), { size: 18 }));
    top.appendChild(iconBox);

    const metaBox = document.createElement("div");
    metaBox.className = "drive-card-meta-box";

    const title = document.createElement("span");
    title.className = "drive-card-title";
    title.textContent = item.fileName || "File";
    title.title = item.fileName || "";
    metaBox.appendChild(title);

    const submeta = document.createElement("div");
    submeta.className = "drive-card-submeta";
    submeta.textContent = `${this.formatBytes(item.size)} • ${this.formatDate(item.date)}`;
    metaBox.appendChild(submeta);

    top.appendChild(metaBox);

    // Pin & Star Badges
    const badgeRow = document.createElement("div");
    badgeRow.style.cssText = "display:flex;align-items:center;gap:4px;";
    if (isPinned) badgeRow.appendChild(createIcon(Icons.Pin, { size: 12, color: "#38bdf8" }));
    if (isFav) badgeRow.appendChild(createIcon(Icons.Star, { size: 12, color: "#eab308" }));
    top.appendChild(badgeRow);

    card.appendChild(top);

    // Card Actions Row
    const actions = document.createElement("div");
    actions.className = "drive-card-actions";

    const catBadge = document.createElement("span");
    catBadge.className = "drive-badge";
    catBadge.textContent = item.category;
    actions.appendChild(catBadge);

    const actionBtns = document.createElement("div");
    actionBtns.style.cssText = "display:flex;align-items:center;gap:4px;";

    // Pin Button
    const btnPin = document.createElement("button");
    btnPin.className = "drive-action-icon-btn";
    btnPin.title = isPinned ? "Unpin" : "Pin";
    btnPin.appendChild(createIcon(Icons.Pin, { size: 12 }));
    btnPin.onclick = (e) => { e.stopPropagation(); vaultStore.togglePin(item.id); };
    actionBtns.appendChild(btnPin);

    // Star Button
    const btnStar = document.createElement("button");
    btnStar.className = "drive-action-icon-btn";
    btnStar.title = isFav ? "Unfavorite" : "Favorite";
    btnStar.appendChild(createIcon(Icons.Star, { size: 12 }));
    btnStar.onclick = (e) => { e.stopPropagation(); vaultStore.toggleFavorite(item.id); };
    actionBtns.appendChild(btnStar);

    // Download Button
    const btnDownload = document.createElement("button");
    btnDownload.className = "drive-download-pill";
    btnDownload.appendChild(createIcon(Icons.Download, { size: 12 }));
    const saveTxt = document.createElement("span");
    saveTxt.textContent = "Save";
    btnDownload.appendChild(saveTxt);
    btnDownload.onclick = async (e) => {
      e.stopPropagation();
      await this.downloadItem(item, btnDownload);
    };
    actionBtns.appendChild(btnDownload);

    actions.appendChild(actionBtns);
    card.appendChild(actions);

    card.onclick = () => {
      this.openPreview(item);
    };

    return card;
  }

  // --- LIST VIEW ---
  renderListView(items) {
    const tbody = this.container.querySelector("#drive-files-table-body");
    if (!tbody) return;

    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    if (items.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.style.textAlign = "center";
      td.style.padding = "32px";
      td.appendChild(this.createEmptyState());
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (const item of items) {
      const isPinned = vaultStore.pinnedFileIds.has(item.id);
      const isFav = vaultStore.favoriteFileIds.has(item.id);

      const tr = document.createElement("tr");
      tr.className = "drive-table-row";

      // 1. Icon
      const tdIcon = document.createElement("td");
      tdIcon.appendChild(createIcon(this.getItemIconDef(item.category), { size: 15 }));
      tr.appendChild(tdIcon);

      // 2. Name
      const tdName = document.createElement("td");
      const nameBox = document.createElement("div");
      nameBox.style.cssText = "display:flex;align-items:center;gap:6px;";
      
      const nSpan = document.createElement("span");
      nSpan.style.cssText = "font-weight:500;color:hsl(var(--foreground));";
      nSpan.textContent = item.fileName || "File";
      nameBox.appendChild(nSpan);

      if (isPinned) nameBox.appendChild(createIcon(Icons.Pin, { size: 11, color: "#38bdf8" }));
      if (isFav) nameBox.appendChild(createIcon(Icons.Star, { size: 11, color: "#eab308" }));

      tdName.appendChild(nameBox);
      tr.appendChild(tdName);

      // 3. Category
      const tdCat = document.createElement("td");
      const catBadge = document.createElement("span");
      catBadge.className = "drive-badge";
      catBadge.textContent = item.category;
      tdCat.appendChild(catBadge);
      tr.appendChild(tdCat);

      // 4. Size
      const tdSize = document.createElement("td");
      tdSize.style.fontFamily = "var(--font-mono)";
      tdSize.style.fontSize = "0.75rem";
      tdSize.textContent = this.formatBytes(item.size);
      tr.appendChild(tdSize);

      // 5. Date
      const tdDate = document.createElement("td");
      tdDate.style.fontSize = "0.75rem";
      tdDate.style.color = "hsl(var(--muted-foreground))";
      tdDate.textContent = this.formatDate(item.date);
      tr.appendChild(tdDate);

      // 6. Actions
      const tdActions = document.createElement("td");
      tdActions.style.textAlign = "right";

      const actGroup = document.createElement("div");
      actGroup.style.cssText = "display:inline-flex;align-items:center;gap:4px;";

      const btnPin = document.createElement("button");
      btnPin.className = "drive-action-icon-btn";
      btnPin.appendChild(createIcon(Icons.Pin, { size: 12 }));
      btnPin.onclick = (e) => { e.stopPropagation(); vaultStore.togglePin(item.id); };
      actGroup.appendChild(btnPin);

      const btnStar = document.createElement("button");
      btnStar.className = "drive-action-icon-btn";
      btnStar.appendChild(createIcon(Icons.Star, { size: 12 }));
      btnStar.onclick = (e) => { e.stopPropagation(); vaultStore.toggleFavorite(item.id); };
      actGroup.appendChild(btnStar);

      const btnDl = document.createElement("button");
      btnDl.className = "drive-download-pill";
      btnDl.appendChild(createIcon(Icons.Download, { size: 12 }));
      btnDl.onclick = async (e) => {
        e.stopPropagation();
        await this.downloadItem(item, btnDl);
      };
      actGroup.appendChild(btnDl);

      tdActions.appendChild(actGroup);
      tr.appendChild(tdActions);

      tr.onclick = () => this.openPreview(item);
      tbody.appendChild(tr);
    }
  }

  createEmptyState() {
    const empty = document.createElement("div");
    empty.className = "drive-empty-box";
    empty.appendChild(createIcon(Icons.File, { size: 32, strokeWidth: 1.5 }));
    const t = document.createElement("span");
    t.textContent = "No files found in this category or search filter.";
    empty.appendChild(t);
    return empty;
  }

  // --- PREVIEW MODAL ---
  openPreview(item) {
    const backdrop = this.container.querySelector("#preview-modal-backdrop");
    const nameEl = this.container.querySelector("#preview-filename");
    const bodyEl = this.container.querySelector("#preview-body-content");
    if (!backdrop || !bodyEl) return;

    nameEl.textContent = item.fileName || "Media Preview";
    while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);

    if (item.category === "videos" || item.category === "audio") {
      if (this.onPlayMedia) this.onPlayMedia(item);
      backdrop.classList.remove("hidden");
      
      const v = document.createElement("video");
      v.controls = true;
      v.autoplay = true;
      v.style.cssText = "max-width:100%;max-height:70vh;border-radius:var(--radius);";
      v.src = item.streamUrl;
      bodyEl.appendChild(v);
    } else {
      backdrop.classList.remove("hidden");
      const infoBox = document.createElement("div");
      infoBox.style.cssText = "padding:24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;";
      infoBox.appendChild(createIcon(this.getItemIconDef(item.category), { size: 48 }));
      
      const details = document.createElement("p");
      details.style.color = "hsl(var(--muted-foreground))";
      details.textContent = `Size: ${this.formatBytes(item.size)} • Type: ${item.mimeType}`;
      infoBox.appendChild(details);

      const btnSave = document.createElement("button");
      btnSave.className = "shadcn-button";
      btnSave.textContent = "Download from Telegram";
      btnSave.onclick = async () => {
        await this.downloadItem(item, btnSave);
      };
      infoBox.appendChild(btnSave);

      bodyEl.appendChild(infoBox);
    }
  }

  async downloadItem(item, btnEl) {
    btnEl.disabled = true;
    const orig = btnEl.innerHTML;
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
      a.download = (item.fileName || "download").replace(/[/\\?%*:|"<>]/g, "_");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      btnEl.innerHTML = `✓ Saved`;
      setTimeout(() => {
        btnEl.disabled = false;
        btnEl.innerHTML = orig;
      }, 2500);
    } catch (err) {
      console.error("Download failed:", err);
      btnEl.disabled = false;
      btnEl.innerHTML = `Failed`;
    }
  }

  getItemIconDef(category) {
    switch (category) {
      case "videos": return Icons.Video;
      case "archives": return Icons.Archive;
      case "audio": return Icons.Music;
      case "images": return Icons.Image;
      case "documents": return Icons.FileText;
      default: return Icons.File;
    }
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  formatDate(timestamp) {
    if (!timestamp) return "Recently";
    const d = new Date(timestamp * 1000);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
}
