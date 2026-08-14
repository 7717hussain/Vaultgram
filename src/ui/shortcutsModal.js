export class ShortcutsModal {
  constructor(containerEl) {
    this.container = containerEl;
    this.isVisible = false;
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="modal-backdrop hidden" id="shortcuts-modal-backdrop">
        <div class="modal-card shortcuts-modal-card">
          <div class="modal-header">
            <div class="modal-title-group">
              <div class="modal-icon">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="8"/><line x1="10" y1="8" x2="10" y2="8"/><line x1="14" y1="8" x2="14" y2="8"/><line x1="18" y1="8" x2="18" y2="8"/><line x1="6" y1="12" x2="6" y2="12"/><line x1="10" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="14" y2="12"/><line x1="18" y1="12" x2="18" y2="12"/><line x1="7" y1="16" x2="17" y2="16"/></svg>
              </div>
              <div>
                <h3 class="modal-title">Keyboard Shortcuts</h3>
                <p class="modal-subtitle">Quick hotkeys for fast navigation & player controls</p>
              </div>
            </div>
            <button class="modal-close-btn" id="shortcuts-close-btn">&times;</button>
          </div>

          <div class="modal-body shortcuts-grid">
            <div class="shortcut-group">
              <div class="shortcut-group-title">Navigation & UI</div>
              <div class="shortcut-item">
                <span class="shortcut-label">Toggle Shortcuts</span>
                <kbd class="shortcut-key">?</kbd>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Focus Global Search</span>
                <kbd class="shortcut-key">/</kbd>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Next Lecture</span>
                <kbd class="shortcut-key">N</kbd>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Previous Lecture</span>
                <kbd class="shortcut-key">P</kbd>
              </div>
            </div>

            <div class="shortcut-group">
              <div class="shortcut-group-title">Player Controls</div>
              <div class="shortcut-item">
                <span class="shortcut-label">Play / Pause</span>
                <div class="key-combo"><kbd class="shortcut-key">Space</kbd> or <kbd class="shortcut-key">K</kbd></div>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Seek Backward 10s</span>
                <div class="key-combo"><kbd class="shortcut-key">J</kbd> or <kbd class="shortcut-key">&larr;</kbd></div>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Seek Forward 10s</span>
                <div class="key-combo"><kbd class="shortcut-key">L</kbd> or <kbd class="shortcut-key">&rarr;</kbd></div>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Toggle Fullscreen</span>
                <kbd class="shortcut-key">F</kbd>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Mute / Unmute</span>
                <kbd class="shortcut-key">M</kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const backdrop = this.container.querySelector("#shortcuts-modal-backdrop");
    const closeBtn = this.container.querySelector("#shortcuts-close-btn");

    closeBtn.onclick = () => this.hide();
    backdrop.onclick = (e) => {
      if (e.target === backdrop) this.hide();
    };
  }

  show() {
    this.isVisible = true;
    const backdrop = this.container.querySelector("#shortcuts-modal-backdrop");
    backdrop.classList.remove("hidden");
  }

  hide() {
    this.isVisible = false;
    const backdrop = this.container.querySelector("#shortcuts-modal-backdrop");
    backdrop.classList.add("hidden");
  }

  toggle() {
    if (this.isVisible) this.hide();
    else this.show();
  }
}
