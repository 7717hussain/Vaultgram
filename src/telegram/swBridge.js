import { tgStreamClient } from "./client.js";

// Active stream controllers for aborting in-flight transfers
const activeStreams = new Map();

export function setupServiceWorkerBridge() {
  if (!("serviceWorker" in navigator)) {
    console.warn("Service Worker not supported in this browser.");
    return;
  }

  navigator.serviceWorker.addEventListener("message", async (event) => {
    const data = event.data;
    if (!data) return;

    if (data.type === "FETCH_CHUNKS") {
      const { requestId, channelId, messageId, startOffset, endOffset, chunkSize, totalSize } = data;
      const port = event.ports && event.ports[0];

      if (!port) {
        console.error("No port provided for FETCH_CHUNKS request");
        return;
      }

      const abortController = new AbortController();
      activeStreams.set(requestId, abortController);

      // Listen for abort signal from SW
      port.onmessage = (e) => {
        if (e.data && e.data.type === "ABORT_STREAM") {
          abortController.abort();
          activeStreams.delete(requestId);
        }
      };

      try {
        let currentOffset = startOffset;

        while (currentOffset < endOffset && !abortController.signal.aborted) {
          const chunkLimit = Math.min(chunkSize, endOffset - currentOffset);

          const chunkBytes = await tgStreamClient.fetchChunk(
            channelId,
            messageId,
            currentOffset,
            chunkLimit
          );

          if (abortController.signal.aborted) break;

          if (!chunkBytes || chunkBytes.length === 0) {
            break;
          }

          // Transfer arrayBuffer to worker without copying
          const buffer = chunkBytes.buffer.slice(
            chunkBytes.byteOffset,
            chunkBytes.byteOffset + chunkBytes.byteLength
          );

          port.postMessage(
            {
              type: "CHUNK_DATA",
              requestId,
              offset: currentOffset,
              bytes: buffer,
            },
            [buffer]
          );

          currentOffset += chunkBytes.length;

          if (chunkBytes.length < chunkLimit) {
            // Reached end of file
            break;
          }
        }

        if (!abortController.signal.aborted) {
          port.postMessage({ type: "CHUNK_END", requestId });
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          console.error(`Stream error for req ${requestId}:`, err);
          port.postMessage({
            type: "CHUNK_ERROR",
            requestId,
            error: err.message || "Failed to fetch media chunk",
          });
        }
      } finally {
        activeStreams.delete(requestId);
      }
    }
  });
}
