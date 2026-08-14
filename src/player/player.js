import 'vidstack/player';
import 'vidstack/player/ui';
import 'vidstack/player/layouts/default';
import 'vidstack/player/styles/default/theme.css';
import 'vidstack/player/styles/default/layouts/video.css';
import { ProgressTracker } from "./progressTracker.js";

export class VideoPlayer {
  constructor(containerEl, onNextMedia = null, onPrevMedia = null) {
    this.container = containerEl;
    this.onNextMedia = onNextMedia;
    this.onPrevMedia = onPrevMedia;
    this.currentMedia = null;
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
          title="Select a video to stream from Telegram"
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
      if (this.currentMedia && currentTime > 0) {
        ProgressTracker.set(this.currentMedia.id, currentTime, duration);
      }
    });

    this.player.addEventListener("ended", () => {
      if (this.currentMedia) {
        ProgressTracker.markCompleted(this.currentMedia.id, true);
      }
      if (this.onNextMedia) this.onNextMedia();
    });

    this.player.addEventListener("play", () => {
      this.startProgressSave();
    });

    this.player.addEventListener("pause", () => {
      this.saveCurrentProgress();
    });
  }

  loadMedia(item, autoPlay = true) {
    this.currentMedia = item;
    if (!this.player) return;

    this.player.setAttribute("title", item.fileName || item.title);

    // Telegram MTProto stream URL intercepted by Service Worker
    const streamUrl = item.streamUrl || `/stream/${item.channelId}/${item.messageId}?size=${item.size}&mime=${encodeURIComponent(
      item.mimeType || "video/mp4"
    )}`;

    this.player.src = {
      src: streamUrl,
      type: item.mimeType?.startsWith("video/") ? "video/mp4" : item.mimeType || "video/mp4",
    };

    // Auto-resume from saved progress timestamp
    const saved = ProgressTracker.get(item.id);
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
    if (this.currentMedia && this.player && this.player.currentTime > 0) {
      ProgressTracker.set(this.currentMedia.id, this.player.currentTime, this.player.duration);
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
