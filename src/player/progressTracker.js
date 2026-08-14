const PROGRESS_KEY = "vaultgram_progress";

export class ProgressTracker {
  static getAll() {
    try {
      const data = localStorage.getItem(PROGRESS_KEY);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  static get(lectureId) {
    const all = this.getAll();
    return all[lectureId] || { time: 0, duration: 0, pct: 0, completed: false, lastUpdated: 0 };
  }

  static set(lectureId, time, duration) {
    if (!lectureId || isNaN(time)) return;
    const all = this.getAll();
    const pct = duration > 0 ? Math.min(100, Math.round((time / duration) * 100)) : 0;
    const completed = pct >= 90;

    all[lectureId] = {
      time: Math.floor(time),
      duration: Math.floor(duration || 0),
      pct,
      completed,
      lastUpdated: Date.now(),
    };

    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  static markCompleted(lectureId, isCompleted = true) {
    const all = this.getAll();
    const curr = all[lectureId] || { time: 0, duration: 0, pct: 0 };
    all[lectureId] = {
      ...curr,
      completed: isCompleted,
      pct: isCompleted ? 100 : curr.pct,
      lastUpdated: Date.now(),
    };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  }
}
