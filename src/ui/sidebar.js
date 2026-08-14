import { ProgressTracker } from "../player/progressTracker.js";

export class Sidebar {
  constructor(containerEl, { onSelectChapter, onSelectSearchResult }) {
    this.container = containerEl;
    this.onSelectChapter = onSelectChapter;
    this.onSelectSearchResult = onSelectSearchResult;

    this.batches = [];
    this.activeBatchId = "fastlane";
    this.activeSubjectId = "physics";
    this.activeChapterId = null;
    this.hideCompleted = false;

    this.render();
  }

  setData(batches) {
    this.batches = batches;
    if (this.batches.length > 0) {
      if (!this.activeBatchId || !this.batches.find((b) => b.id === this.activeBatchId)) {
        this.activeBatchId = this.batches[0].id;
      }
    }
    this.updateView();
  }

  render() {
    this.container.innerHTML = `
      <aside class="sidebar-wrapper">
        <!-- Logo / App Branding Header -->
        <div class="sidebar-brand">
          <div class="brand-badge">VAULTGRAM</div>
          <div class="brand-title">Streaming Vault</div>
        </div>

        <!-- Global Search Bar -->
        <div class="search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="global-search-input" placeholder="Search lectures (/)...">
          <button id="search-clear-btn" class="search-clear-btn hidden">&times;</button>
        </div>

        <!-- Search Results Dropdown Overlay -->
        <div class="search-results-panel hidden" id="search-results-panel"></div>

        <!-- Batch Selector Tabs -->
        <div class="batch-tabs" id="batch-tabs"></div>

        <!-- Subject Filter Pills -->
        <div class="subject-pills" id="subject-pills"></div>

        <!-- Chapter Tree Navigation List -->
        <div class="chapter-list-container">
          <div class="chapter-list-header">
            <span>Chapters</span>
            <button class="filter-toggle-btn" id="filter-completed-btn" title="Toggle Hiding Completed Chapters">
              <span>Completed</span>
            </button>
          </div>
          <div class="chapter-list" id="chapter-list"></div>
        </div>
      </aside>
    `;

    this.bindSearchEvents();
  }

  bindSearchEvents() {
    const input = this.container.querySelector("#global-search-input");
    const clearBtn = this.container.querySelector("#search-clear-btn");
    const resultsPanel = this.container.querySelector("#search-results-panel");

    window.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      }
    });

    input.oninput = () => {
      const q = input.value.trim();
      clearBtn.classList.toggle("hidden", !q);
      if (!q) {
        resultsPanel.classList.add("hidden");
        return;
      }

      if (this.onSelectSearchResult) {
        this.onSelectSearchResult(q, (results) => this.renderSearchResults(results));
      }
    };

    clearBtn.onclick = () => {
      input.value = "";
      clearBtn.classList.add("hidden");
      resultsPanel.classList.add("hidden");
    };

    const filterCompletedBtn = this.container.querySelector("#filter-completed-btn");
    if (filterCompletedBtn) {
      filterCompletedBtn.onclick = () => {
        this.hideCompleted = !this.hideCompleted;
        filterCompletedBtn.classList.toggle("active", this.hideCompleted);
        this.renderChapterList();
      };
    }
  }

  renderSearchResults(results) {
    const resultsPanel = this.container.querySelector("#search-results-panel");
    if (!results || results.length === 0) {
      resultsPanel.innerHTML = `<div class="search-empty">No matching lectures found</div>`;
      resultsPanel.classList.remove("hidden");
      return;
    }

    resultsPanel.innerHTML = results
      .map(
        (r) => `
        <div class="search-item" data-batch="${r.batchId}" data-subj="${r.subjectId}" data-chap="${r.chapterId}" data-item-id="${r.item.id}">
          <div class="search-item-type lecture">VIDEO</div>
          <div class="search-item-info">
            <div class="search-item-title">${r.item.title}</div>
            <div class="search-item-meta">${r.batchName} &bull; ${r.chapterName}</div>
          </div>
        </div>
      `
      )
      .join("");

    resultsPanel.classList.remove("hidden");

    resultsPanel.querySelectorAll(".search-item").forEach((el) => {
      el.onclick = () => {
        const batchId = el.dataset.batch;
        const subjId = el.dataset.subj;
        const chapId = el.dataset.chap;
        const itemId = el.dataset.itemId;

        this.activeBatchId = batchId;
        this.activeSubjectId = subjId;
        this.activeChapterId = chapId;
        this.updateView();

        resultsPanel.classList.add("hidden");

        const batch = this.batches.find((b) => b.id === batchId);
        const subj = batch?.subjects.find((s) => s.id === subjId);
        const chap = subj?.chapters.find((c) => c.id === chapId);

        if (chap && this.onSelectChapter) {
          this.onSelectChapter(chap, batch, subj, itemId);
        }
      };
    });
  }

  updateView() {
    this.renderBatchTabs();
    this.renderSubjectPills();
    this.renderChapterList();
  }

  renderBatchTabs() {
    const tabsContainer = this.container.querySelector("#batch-tabs");
    tabsContainer.innerHTML = this.batches
      .map(
        (b) => `
        <button class="batch-tab-btn ${b.id === this.activeBatchId ? "active" : ""}" data-batch-id="${b.id}">
          ${b.name}
        </button>
      `
      )
      .join("");

    tabsContainer.querySelectorAll(".batch-tab-btn").forEach((btn) => {
      btn.onclick = () => {
        this.activeBatchId = btn.dataset.batchId;
        const currBatch = this.batches.find((b) => b.id === this.activeBatchId);
        if (currBatch && currBatch.subjects.length > 0) {
          this.activeSubjectId = currBatch.subjects[0].id;
        }
        this.updateView();
      };
    });
  }

  renderSubjectPills() {
    const pillsContainer = this.container.querySelector("#subject-pills");
    const currBatch = this.batches.find((b) => b.id === this.activeBatchId);
    if (!currBatch) return;

    pillsContainer.innerHTML = currBatch.subjects
      .map(
        (s) => `
        <button class="subject-pill-btn ${s.id === this.activeSubjectId ? "active" : ""}" data-subj-id="${s.id}">
          ${s.name}
        </button>
      `
      )
      .join("");

    pillsContainer.querySelectorAll(".subject-pill-btn").forEach((btn) => {
      btn.onclick = () => {
        this.activeSubjectId = btn.dataset.subjId;
        this.updateView();
      };
    });
  }

  renderChapterList() {
    const listContainer = this.container.querySelector("#chapter-list");
    const currBatch = this.batches.find((b) => b.id === this.activeBatchId);
    if (!currBatch) return;

    const currSubj = currBatch.subjects.find((s) => s.id === this.activeSubjectId);
    if (!currSubj || currSubj.chapters.length === 0) {
      listContainer.innerHTML = `<div class="chapter-empty">No chapters available</div>`;
      return;
    }

    const progressAll = ProgressTracker.getAll();

    let displayChapters = currSubj.chapters.map((ch, idx) => {
      const completedCount = ch.lectures.filter((l) => progressAll[l.id]?.completed).length;
      const isCompleted = ch.lectures.length > 0 && completedCount === ch.lectures.length;
      return { ch, originalIndex: idx, isCompleted };
    });

    if (this.hideCompleted) {
      displayChapters = displayChapters.filter((item) => !item.isCompleted);
    }

    if (displayChapters.length === 0) {
      listContainer.innerHTML = `<div class="chapter-empty">All chapters completed in this subject!</div>`;
      return;
    }

    listContainer.innerHTML = displayChapters
      .map(({ ch, originalIndex, isCompleted }) => {
        const isSelected = ch.id === this.activeChapterId;

        return `
          <div class="chapter-item ${isSelected ? "active" : ""} ${isCompleted ? "completed" : ""}" data-chap-id="${ch.id}">
            <div class="chapter-item-left">
              <span class="chapter-num">${originalIndex + 1}</span>
              <span class="chapter-name" title="${ch.name}">${ch.name}</span>
            </div>
            <div class="chapter-badges">
              <span class="badge-count">${ch.lectureCount}L</span>
            </div>
          </div>
        `;
      })
      .join("");

    if (!this.activeChapterId && displayChapters.length > 0) {
      const firstChap = displayChapters[0].ch;
      this.activeChapterId = firstChap.id;
      if (this.onSelectChapter) {
        this.onSelectChapter(firstChap, currBatch, currSubj);
      }
      this.renderChapterList();
      return;
    }

    listContainer.querySelectorAll(".chapter-item").forEach((el) => {
      el.onclick = () => {
        const chapId = el.dataset.chapId;
        this.activeChapterId = chapId;
        const chap = currSubj.chapters.find((c) => c.id === chapId);
        this.renderChapterList();
        if (chap && this.onSelectChapter) {
          this.onSelectChapter(chap, currBatch, currSubj);
        }
      };
    });
  }
}
