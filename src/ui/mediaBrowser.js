import { vaultStore } from "../catalog/vaultStore.js";
import { tgStreamClient } from "../telegram/client.js";
import { createIcon, Icons } from "./icons.js";

export class MediaBrowser {
  constructor(containerEl, { onPlayMedia }) {
    this.container = containerEl;
    this.onPlayMedia = onPlayMedia;
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
        <!-- Explorer Header Info & Actions -->
        <div class="explorer-header">
          <div class="explorer-header-left">
            <div class="explorer-breadcrumbs" id="browser-breadcrumb">
              <span>Vaultgram</span>
              <span>/</span>
              <span id="breadcrumb-channel">All Channels</span>
            </div>
            <h1 class="explorer-title-main" id="browser-title">Files & Streams</h1>
          </div>

          <div class="explorer-actions">
            <button class="btn-new-folder" id="btn-create-folder">
              <span class="plus-icon-holder"></span>
              <span>New Folder</span>
            </button>
          </div>
        </div>

        <!-- Folders Grid Section -->
        <div id="folders-section-container">
          <div class="explorer-section-title">
            <span class="folder-title-icon"></span>
            <span>Folders & Groups</span>
          </div>
          <div class="folders-grid" id="folders-grid-list"></div>
        </div>

        <!-- Files Grid Section -->
        <div id="files-section-container">
          <div class="explorer-section-title">
            <span class="files-title-icon"></span>
            <span>Files & Media (<span id="files-count-badge">0</span>)</span>
          </div>
          <div class="files-grid" id="files-grid-list"></div>
        </div>
      </div>
    `;

    const plusHolder = this.container.querySelector(".plus-icon-holder");
    if (plusHolder) plusHolder.appendChild(createIcon(Icons.Plus, { size: 14 }));

    const folderTitleIcon = this.container.querySelector(".folder-title-icon");
    if (folderTitleIcon) folderTitleIcon.appendChild(createIcon(Icons.Folder, { size: 14 }));

    const filesTitleIcon = this.container.querySelector(".files-title-icon");
    if (filesTitleIcon) filesTitleIcon.appendChild(createIcon(Icons.LayoutGrid, { size: 14 }));
  }

  bindEvents() {
    const btnNewFolder = this.container.querySelector("#btn-create-folder");
    if (btnNewFolder) {
      btnNewFolder.onclick = () => {
        const folderName = prompt("Folder Name (e.g. 'Fastlane', 'Notes', 'Physics'):");
        if (!folderName || !folderName.trim()) return;
        const pattern = prompt(`Match keyword in file names (defaults to '${folderName.trim()}'):`, folderName.trim());
        if (!pattern || !pattern.trim()) return;

        vaultStore.addCustomFolder(folderName, pattern);
      };
    }
  }

  updateView() {
    const breadcrumbChannel = this.container.querySelector("#breadcrumb-channel");
    const titleEl = this.container.querySelector("#browser-title");
    const filesCountBadge = this.container.querySelector("#files-count-badge");
    const foldersGrid = this.container.querySelector("#folders-grid-list");
    const filesGrid = this.container.querySelector("#files-grid-list");

    const channelName =
      vaultStore.activeChannelId === "all"
        ? "All Channels (Unified)"
        : vaultStore.channels.find((c) => c.id === vaultStore.activeChannelId)?.title || "Channel";

    breadcrumbChannel.textContent = channelName;
    titleEl.textContent = vaultStore.activeCustomFolder
      ? `${vaultStore.activeCustomFolder} Folder`
      : vaultStore.activeCategory !== "all"
      ? `${vaultStore.activeCategory.charAt(0).toUpperCase() + vaultStore.activeCategory.slice(1)} Explorer`
      : "All Files & Streams";

    // 1. Render Folders Grid (File types + Custom folders)
    this.renderFoldersGrid(foldersGrid);

    // 2. Render Files Grid
    const items = vaultStore.getFilteredItems(this.searchQuery);
    filesCountBadge.textContent = items.length;

    while (filesGrid.firstChild) {
      filesGrid.removeChild(filesGrid.firstChild);
    }

    if (items.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "explorer-empty-view";
      emptyDiv.style.gridColumn = "1 / -1";
      emptyDiv.appendChild(createIcon(Icons.File, { size: 32, strokeWidth: 1.5 }));
      
      const emptyText = document.createElement("span");
      emptyText.textContent = "No files found matching the current channel or folder filter.";
      emptyDiv.appendChild(emptyText);

      filesGrid.appendChild(emptyDiv);
      return;
    }

    for (const item of items) {
      const card = this.createFileCard(item);
      filesGrid.appendChild(card);
    }
  }

  renderFoldersGrid(container) {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const counts = vaultStore.getCategoryCounts();
    const customFolderCounts = vaultStore.getCustomFolderCounts();

    // Standard Categories
    const categories = [
      { id: "all", name: "All Files", icon: Icons.LayoutGrid, count: counts.all },
      { id: "videos", name: "Videos & Streams", icon: Icons.Video, count: counts.videos },
      { id: "archives", name: "Archives (ZIP/RAR)", icon: Icons.Archive, count: counts.archives },
      { id: "documents", name: "Documents & PDFs", icon: Icons.FileText, count: counts.documents },
      { id: "images", name: "Images", icon: Icons.Image, count: counts.images },
      { id: "audio", name: "Audio & Music", icon: Icons.Music, count: counts.audio },
    ];

    for (const cat of categories) {
      const isAct = !vaultStore.activeCustomFolder && vaultStore.activeCategory === cat.id;
      const card = document.createElement("div");
      card.className = `folder-card ${isAct ? "active" : ""}`;

      const left = document.createElement("div");
      left.className = "folder-card-left";

      const iconBox = document.createElement("div");
      iconBox.className = "folder-icon-box";
      iconBox.appendChild(createIcon(cat.icon, { size: 16 }));
      left.appendChild(iconBox);

      const info = document.createElement("div");
      info.className = "folder-card-info";

      const name = document.createElement("span");
      name.className = "folder-name";
      name.textContent = cat.name;
      info.appendChild(name);

      const count = document.createElement("span");
      count.className = "folder-count";
      count.textContent = `${cat.count} files`;
      info.appendChild(count);

      left.appendChild(info);
      card.appendChild(left);

      card.onclick = () => {
        vaultStore.setActiveCategory(cat.id);
      };

      container.appendChild(card);
    }

    // Custom Folders
    for (const folder of vaultStore.customFolders) {
      const isAct = vaultStore.activeCustomFolder === folder.name;
      const count = customFolderCounts[folder.name] || 0;

      const card = document.createElement("div");
      card.className = `folder-card ${isAct ? "active" : ""}`;

      const left = document.createElement("div");
      left.className = "folder-card-left";

      const iconBox = document.createElement("div");
      iconBox.className = "folder-icon-box";
      iconBox.appendChild(createIcon(Icons.Folder, { size: 16 }));
      left.appendChild(iconBox);

      const info = document.createElement("div");
      info.className = "folder-card-info";

      const name = document.createElement("span");
      name.className = "folder-name";
      name.textContent = folder.name;
      info.appendChild(name);

      const countSpan = document.createElement("span");
      countSpan.className = "folder-count";
      countSpan.textContent = `${count} files`;
      info.appendChild(countSpan);

      left.appendChild(info);
      card.appendChild(left);

      const delBtn = document.createElement("button");
      delBtn.className = "btn-delete-folder-card";
      delBtn.title = "Delete Folder";
      delBtn.appendChild(createIcon(Icons.Trash2, { size: 13 }));
      delBtn.onclick = (e) => {
        e.stopPropagation();
        vaultStore.removeCustomFolder(folder.name);
      };
      card.appendChild(delBtn);

      card.onclick = () => {
        vaultStore.setActiveCustomFolder(folder.name);
      };

      container.appendChild(card);
    }
  }

  createFileCard(item) {
    const card = document.createElement("div");
    card.className = "file-card";
    card.dataset.id = item.id;

    // Top section: Icon + Title + Meta
    const top = document.createElement("div");
    top.className = "file-card-top";

    const iconBox = document.createElement("div");
    iconBox.className = "file-icon-box";
    const iconDef = this.getItemIconDef(item.category);
    iconBox.appendChild(createIcon(iconDef, { size: 18 }));
    top.appendChild(iconBox);

    const metaBox = document.createElement("div");
    metaBox.className = "file-meta-box";

    const title = document.createElement("span");
    title.className = "file-title";
    title.textContent = item.fileName || "File";
    title.title = item.fileName || "";
    metaBox.appendChild(title);

    const submeta = document.createElement("div");
    submeta.className = "file-submeta";

    const sizeSpan = document.createElement("span");
    sizeSpan.textContent = this.formatBytes(item.size);
    submeta.appendChild(sizeSpan);

    const dotSpan = document.createElement("span");
    dotSpan.textContent = "•";
    submeta.appendChild(dotSpan);

    const catSpan = document.createElement("span");
    catSpan.textContent = item.category;
    submeta.appendChild(catSpan);

    metaBox.appendChild(submeta);
    top.appendChild(metaBox);
    card.appendChild(top);

    // Actions section: Badge + Save Button
    const actions = document.createElement("div");
    actions.className = "file-card-actions";

    const badge = document.createElement("span");
    badge.className = "file-badge-category";
    badge.textContent = item.category;
    actions.appendChild(badge);

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "file-download-btn";
    downloadBtn.title = "Download file via Telegram MTProto";
    downloadBtn.appendChild(createIcon(Icons.Download, { size: 12 }));
    
    const saveText = document.createElement("span");
    saveText.textContent = "Save";
    downloadBtn.appendChild(saveText);

    downloadBtn.onclick = async (e) => {
      e.stopPropagation();
      await this.downloadItem(item, downloadBtn);
    };
    actions.appendChild(downloadBtn);

    card.appendChild(actions);

    card.onclick = () => {
      if (this.onPlayMedia) {
        this.onPlayMedia(item);
      }
    };

    return card;
  }

  getItemIconDef(category) {
    switch (category) {
      case "videos":
        return Icons.Video;
      case "archives":
        return Icons.Archive;
      case "audio":
        return Icons.Music;
      case "images":
        return Icons.Image;
      case "documents":
        return Icons.FileText;
      default:
        return Icons.File;
    }
  }

  async downloadItem(item, btnEl) {
    while (btnEl.firstChild) btnEl.removeChild(btnEl.firstChild);
    btnEl.disabled = true;

    const spinner = document.createElement("span");
    spinner.className = "download-spinner";
    btnEl.appendChild(spinner);

    const progressText = document.createElement("span");
    progressText.textContent = " 0%";
    btnEl.appendChild(progressText);

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
        progressText.textContent = ` ${progress}%`;
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

      while (btnEl.firstChild) btnEl.removeChild(btnEl.firstChild);
      btnEl.appendChild(createIcon(Icons.Check, { size: 12 }));
      const doneText = document.createElement("span");
      doneText.textContent = " Saved";
      btnEl.appendChild(doneText);

      setTimeout(() => {
        btnEl.disabled = false;
        while (btnEl.firstChild) btnEl.removeChild(btnEl.firstChild);
        btnEl.appendChild(createIcon(Icons.Download, { size: 12 }));
        const defaultText = document.createElement("span");
        defaultText.textContent = " Save";
        btnEl.appendChild(defaultText);
      }, 3000);
    } catch (err) {
      console.error("Download error:", err);
      btnEl.disabled = false;
      while (btnEl.firstChild) btnEl.removeChild(btnEl.firstChild);
      btnEl.appendChild(createIcon(Icons.AlertTriangle, { size: 12 }));
      const failText = document.createElement("span");
      failText.textContent = " Failed";
      btnEl.appendChild(failText);
    }
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }
}
