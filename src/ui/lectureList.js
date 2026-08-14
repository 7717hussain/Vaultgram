import { ProgressTracker } from "../player/progressTracker.js";

export class LectureList {
  constructor(containerEl, { onPlayLecture }) {
    this.container = containerEl;
    this.onPlayLecture = onPlayLecture;

    this.currentChapter = null;
    this.currentBatch = null;
    this.currentSubject = null;
    this.currentPlayingId = null;

    this.render();
  }

  setChapter(chapter, batch, subject, autoPlayItemId = null) {
    this.currentChapter = chapter;
    this.currentBatch = batch;
    this.currentSubject = subject;

    if (autoPlayItemId) {
      const lec = chapter.lectures.find((l) => l.id === autoPlayItemId);
      if (lec) {
        this.currentPlayingId = lec.id;
        if (this.onPlayLecture) this.onPlayLecture(lec);
      }
    }

    this.updateView();
  }

  setPlayingId(id) {
    this.currentPlayingId = id;
    this.updateView();
  }

  render() {
    this.container.innerHTML = `
      <div class="lecture-list-wrapper">
        <!-- Chapter Header & Metadata Banner -->
        <div class="chapter-header-banner">
          <div class="chapter-breadcrumbs" id="chapter-breadcrumbs">Select Chapter</div>
          <div class="chapter-title-row">
            <h2 class="chapter-title-main" id="chapter-title-main">--</h2>
            <span class="chapter-count-badge" id="count-lectures">0 Lectures</span>
          </div>
        </div>

        <!-- Lectures Container -->
        <div class="items-scroll-area" id="items-scroll-area"></div>
      </div>
    `;
  }

  updateView() {
    if (!this.currentChapter) return;

    this.container.querySelector("#chapter-breadcrumbs").textContent = `${this.currentBatch?.name || ""} / ${
      this.currentSubject?.name || ""
    }`;
    this.container.querySelector("#chapter-title-main").textContent = this.currentChapter.name;
    this.container.querySelector("#count-lectures").textContent = `${this.currentChapter.lectures.length} Lectures`;

    this.renderItems();
  }

  renderItems() {
    const scrollArea = this.container.querySelector("#items-scroll-area");
    if (!this.currentChapter) return;

    const lectures = this.currentChapter.lectures;
    if (lectures.length === 0) {
      scrollArea.innerHTML = `<div class="items-empty">No video lectures in this chapter</div>`;
      return;
    }

    const progressAll = ProgressTracker.getAll();

    scrollArea.innerHTML = lectures
      .map((lec, idx) => {
        const isPlaying = lec.id === this.currentPlayingId;
        const prog = progressAll[lec.id] || { pct: 0, completed: false, time: 0 };
        const sizeMb = (lec.fileSize / (1024 * 1024)).toFixed(1);

        return `
          <div class="lecture-card ${isPlaying ? "playing" : ""} ${prog.completed ? "completed" : ""}" data-lec-id="${lec.id}">
            <div class="card-play-icon">
              ${
                isPlaying
                  ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
                  : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`
              }
            </div>

            <div class="card-info">
              <div class="card-title">${lec.title}</div>
              <div class="card-meta">
                <span>Lecture ${idx + 1}</span> &bull; 
                <span>${sizeMb} MB</span>
                ${prog.time > 0 ? ` &bull; <span class="resume-hint">Resume @ ${this.formatSec(prog.time)}</span>` : ""}
              </div>

              ${
                prog.pct > 0
                  ? `<div class="card-progress-bar"><div class="card-progress-fill" style="width: ${prog.pct}%"></div></div>`
                  : ""
              }
            </div>

            <div class="card-status-badge">
              ${prog.completed ? `<span class="badge-done">&#10003; Done</span>` : isPlaying ? `<span class="badge-live">Now Playing</span>` : ""}
            </div>

            <div class="card-actions">
              <button class="lec-download-btn" data-dl-id="${lec.id}" title="Download Lecture MP4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span>Download</span>
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    scrollArea.querySelectorAll(".lecture-card").forEach((card) => {
      card.onclick = (e) => {
        if (e.target.closest(".lec-download-btn")) return; // Don't trigger play when clicking download button

        const id = card.dataset.lecId;
        const lec = this.currentChapter.lectures.find((l) => l.id === id);
        if (lec) {
          this.currentPlayingId = id;
          this.renderItems();
          if (this.onPlayLecture) this.onPlayLecture(lec);
        }
      };
    });

    scrollArea.querySelectorAll(".lec-download-btn").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.dataset.dlId;
        const lec = this.currentChapter.lectures.find((l) => l.id === id);
        if (lec) {
          this.downloadLecture(lec, btn);
        }
      };
    });
  }

  async downloadLecture(lec, btnEl) {
    const streamUrl = `/stream/${lec.channelId}/${lec.messageId}?size=${lec.fileSize}&mime=${encodeURIComponent(
      lec.mimeType || "video/mp4"
    )}`;

    btnEl.disabled = true;
    const originalContent = btnEl.innerHTML;
    btnEl.innerHTML = `<span class="download-spinner"></span> 0%`;

    try {
      const response = await fetch(streamUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const contentLength = lec.fileSize;
      let receivedBytes = 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedBytes += value.length;
        const pct = Math.min(100, Math.round((receivedBytes / contentLength) * 100));
        btnEl.innerHTML = `<span class="download-spinner"></span> ${pct}%`;
      }

      const blob = new Blob(chunks, { type: lec.mimeType || "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${lec.title.replace(/[/\\?%*:|"<>]/g, "_")}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      btnEl.innerHTML = `&#10003; Saved`;
      setTimeout(() => {
        btnEl.disabled = false;
        btnEl.innerHTML = originalContent;
      }, 4000);
    } catch (err) {
      console.error("Download error:", err);
      btnEl.disabled = false;
      btnEl.innerHTML = `⚠️ Failed`;
      setTimeout(() => {
        btnEl.innerHTML = originalContent;
      }, 3000);
    }
  }

  formatSec(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  }
}
