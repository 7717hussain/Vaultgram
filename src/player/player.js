import 'vidstack/player';
import 'vidstack/player/ui';
import 'vidstack/player/layouts/default';
import 'vidstack/player/styles/default/theme.css';
import 'vidstack/player/styles/default/layouts/video.css';
import { ProgressTracker } from "./progressTracker.js";

export class VideoPlayer {
  constructor(containerEl, onNextLecture = null, onPrevLecture = null) {
    this.container = containerEl;
    this.onNextLecture = onNextLecture;
    this.onPrevLecture = onPrevLecture;
    this.currentLecture = null;
    this.player = null;
    this.saveInterval = null;

    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="vds-container-wrapper">
        <media-player
          id="vidstack-player"
          title="Select a lecture from the sidebar"
          src=""
          view-type="video"
          stream-type="on-demand"
          log-level="warn"
          crossorigin
          playsinline
        >
          <media-provider></media-provider>
          <media-video-layout></media-video-layout>
        </media-player>
      </div>
    `;

    this.player = this.container.querySelector("#vidstack-player");
  }

  bindEvents() {
    if (!this.player) return;

    // Listen to Vidstack player events
    this.player.addEventListener("time-update", (event) => {
      const { currentTime, duration } = event.detail;
      if (this.currentLecture && currentTime > 0) {
        ProgressTracker.set(this.currentLecture.id, currentTime, duration);
      }
    });

    this.player.addEventListener("ended", () => {
      if (this.currentLecture) {
        ProgressTracker.markCompleted(this.currentLecture.id, true);
      }
      if (this.onNextLecture) this.onNextLecture();
    });

    this.player.addEventListener("play", () => {
      this.startProgressSave();
    });

    this.player.addEventListener("pause", () => {
      this.saveCurrentProgress();
    });
  }

  loadLecture(lecture, autoPlay = true) {
    this.currentLecture = lecture;
    if (!this.player) return;

    this.player.setAttribute("title", lecture.title);

    // Telegram MTProto stream URL intercepted by Service Worker
    const streamUrl = `/stream/${lecture.channelId}/${lecture.messageId}?size=${lecture.fileSize}&mime=${encodeURIComponent(
      lecture.mimeType || "video/mp4"
    )}`;

    this.player.src = {
      src: streamUrl,
      type: "video/mp4",
    };

    // Auto-resume from saved progress timestamp
    const saved = ProgressTracker.get(lecture.id);
    if (saved && saved.time > 5) {
      this.player.currentTime = saved.time;
    }

    if (autoPlay) {
      this.player.play().catch((e) => console.log("Vidstack auto-play notice:", e));
    }
  }

  startProgressSave() {
    if (this.saveInterval) clearInterval(this.saveInterval);
    this.saveInterval = setInterval(() => this.saveCurrentProgress(), 4000);
  }

  saveCurrentProgress() {
    if (this.currentLecture && this.player && this.player.currentTime > 0) {
      ProgressTracker.set(this.currentLecture.id, this.player.currentTime, this.player.duration);
    }
  }

  destroy() {
    if (this.saveInterval) clearInterval(this.saveInterval);
    this.saveCurrentProgress();
    if (this.player) {
      this.player.pause();
      this.player.src = "";
    }
  }
}
