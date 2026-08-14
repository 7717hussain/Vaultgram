import { vaultStore } from "../catalog/vaultStore.js";
import { tgStreamClient } from "../telegram/client.js";
import { createIcon, Icons } from "./icons.js";

export class Sidebar {
  constructor(containerEl, { onChannelChange }) {
    this.container = containerEl;
    this.onChannelChange = onChannelChange;

    this.render();
    this.bindEvents();

    vaultStore.onChange(() => this.updateView());
  }

  render() {
    this.container.innerHTML = `
      <aside class="sidebar-wrapper">
        <div class="sidebar-scrollable-content">
          <!-- Telegram Channels Section -->
          <div class="sidebar-section">
            <div class="sidebar-section-header">
              <span>Channels</span>
              <button class="section-action-btn" id="btn-refresh-channels" title="Refresh Channels">
                <span class="refresh-icon-holder"></span>
              </button>
            </div>
            <div class="channels-nav-list" id="channels-nav-list">
              <!-- Rendered dynamically -->
            </div>
          </div>
        </div>
      </aside>
    `;

    const refreshHolder = this.container.querySelector(".refresh-icon-holder");
    if (refreshHolder) {
      refreshHolder.appendChild(createIcon(Icons.RefreshCw, { size: 12 }));
    }
  }

  bindEvents() {
    const btnRefresh = this.container.querySelector("#btn-refresh-channels");
    if (btnRefresh) {
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
    }
  }

  updateView() {
    this.renderChannels();
  }

  renderChannels() {
    const listEl = this.container.querySelector("#channels-nav-list");
    if (!listEl) return;

    // Clear safely using DOM manipulation (no innerHTML)
    while (listEl.firstChild) {
      listEl.removeChild(listEl.firstChild);
    }

    const channels = vaultStore.channels;
    const activeId = vaultStore.activeChannelId;

    // 1. Unified View Button
    const unifiedBtn = document.createElement("button");
    unifiedBtn.className = `channel-nav-btn ${activeId === "all" ? "active" : ""}`;
    unifiedBtn.dataset.channelId = "all";

    const unifiedLeft = document.createElement("div");
    unifiedLeft.className = "nav-item-left";
    unifiedLeft.appendChild(createIcon(Icons.Layers, { size: 14 }));
    
    const unifiedText = document.createElement("span");
    unifiedText.className = "channel-name-truncate";
    unifiedText.textContent = "All Channels (Unified)";
    unifiedLeft.appendChild(unifiedText);

    unifiedBtn.appendChild(unifiedLeft);
    unifiedBtn.onclick = () => {
      vaultStore.setActiveChannel("all");
      if (this.onChannelChange) this.onChannelChange("all");
    };
    listEl.appendChild(unifiedBtn);

    // 2. Individual Channels
    if (channels.length === 0) {
      const hint = document.createElement("div");
      hint.className = "sidebar-empty-hint";
      hint.textContent = "No channels loaded yet";
      listEl.appendChild(hint);
      return;
    }

    for (const ch of channels) {
      const isAct = activeId === ch.id;
      const btn = document.createElement("button");
      btn.className = `channel-nav-btn ${isAct ? "active" : ""}`;
      btn.dataset.channelId = ch.id;

      const left = document.createElement("div");
      left.className = "nav-item-left";
      left.appendChild(createIcon(ch.isPublic ? Icons.Globe : Icons.Lock, { size: 13 }));

      const nameSpan = document.createElement("span");
      nameSpan.className = "channel-name-truncate";
      nameSpan.textContent = ch.title || "Untitled Channel";
      nameSpan.title = ch.title || "";
      left.appendChild(nameSpan);

      btn.appendChild(left);

      const badge = document.createElement("span");
      badge.className = `channel-badge ${ch.isPublic ? "public" : "private"}`;
      badge.textContent = ch.isPublic ? "Pub" : "Priv";
      btn.appendChild(badge);

      btn.onclick = () => {
        vaultStore.setActiveChannel(ch.id);
        if (this.onChannelChange) this.onChannelChange(ch.id);
      };

      listEl.appendChild(btn);
    }
  }
}
