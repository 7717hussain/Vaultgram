import { ProgressTracker } from "../player/progressTracker.js";

class CatalogStore {
  constructor() {
    this.catalog = null;
    this.isLoading = false;
    this.error = null;
  }

  async load() {
    if (this.catalog) return this.catalog;
    this.isLoading = true;

    try {
      const res = await fetch("/catalog.json");
      if (!res.ok) throw new Error(`HTTP ${res.status} loading catalog`);
      this.catalog = await res.json();
      this.isLoading = false;
      return this.catalog;
    } catch (err) {
      this.error = err.message;
      this.isLoading = false;
      throw err;
    }
  }

  getBatches() {
    return this.catalog ? this.catalog.batches : [];
  }

  getBatch(batchId) {
    if (!this.catalog) return null;
    return this.catalog.batches.find((b) => b.id === batchId) || this.catalog.batches[0];
  }

  search(query) {
    if (!this.catalog || !query || !query.trim()) return [];
    const q = query.toLowerCase().trim();
    const results = [];

    for (const batch of this.catalog.batches) {
      for (const subj of batch.subjects) {
        for (const chap of subj.chapters) {
          for (const lec of chap.lectures) {
            if (
              lec.title.toLowerCase().includes(q) ||
              chap.name.toLowerCase().includes(q) ||
              subj.name.toLowerCase().includes(q)
            ) {
              results.push({
                type: "lecture",
                item: lec,
                batchName: batch.name,
                batchId: batch.id,
                subjectName: subj.name,
                subjectId: subj.id,
                chapterName: chap.name,
                chapterId: chap.id,
              });
            }
          }
        }
      }
    }

    return results.slice(0, 50);
  }

  getStats() {
    if (!this.catalog) return { totalLectures: 0, completedCount: 0 };
    let totalLectures = 0;

    for (const batch of this.catalog.batches) {
      for (const subj of batch.subjects) {
        for (const chap of subj.chapters) {
          totalLectures += chap.lectures.length;
        }
      }
    }

    const progress = ProgressTracker.getAll();
    const completedCount = Object.values(progress).filter((p) => p.completed).length;

    return { totalLectures, completedCount };
  }
}

export const catalogStore = new CatalogStore();
