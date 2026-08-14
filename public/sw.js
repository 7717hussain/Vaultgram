// Service Worker: Telegram MTProto Video & Document Stream Interceptor
const SW_VERSION = "1.0.0";
const CHUNK_SIZE = 512 * 1024; // 512 KB chunks (must be divisible by 4096)

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Intercept stream requests: /stream/:channelId/:messageId
  if (url.pathname.startsWith("/stream/")) {
    event.respondWith(handleStreamRequest(event.request, url));
  }
});

async function handleStreamRequest(request, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  // Expected: ['stream', channelId, messageId]
  if (parts.length < 3) {
    return new Response("Invalid stream URL format", { status: 400 });
  }

  const channelId = parts[1];
  const messageId = parseInt(parts[2], 10);
  const totalSize = parseInt(url.searchParams.get("size") || "0", 10);
  const mimeType = url.searchParams.get("mime") || "video/mp4";

  if (!totalSize || isNaN(totalSize) || isNaN(messageId)) {
    return new Response("Missing size or messageId in stream URL", { status: 400 });
  }

  // Parse Range header (e.g., "bytes=0-", "bytes=1048576-2097151")
  const rangeHeader = request.headers.get("Range");
  let start = 0;
  let end = totalSize - 1;
  let isRange = false;

  if (rangeHeader) {
    const matches = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (matches) {
      isRange = true;
      start = parseInt(matches[1], 10);
      if (matches[2]) {
        end = parseInt(matches[2], 10);
      }
    }
  }

  // Clamp end to totalSize - 1
  if (end >= totalSize) {
    end = totalSize - 1;
  }

  const contentLength = end - start + 1;

  // Align start offset to MTProto 4096-byte boundary (or chunk boundary)
  // For precise streaming, align start down to multiple of CHUNK_SIZE
  const alignedStartOffset = Math.floor(start / CHUNK_SIZE) * CHUNK_SIZE;
  const alignedEndOffset = Math.min(Math.ceil((end + 1) / CHUNK_SIZE) * CHUNK_SIZE, totalSize);
  const skipInitialBytes = start - alignedStartOffset;

  // Get active client to communicate with main thread
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (!clients || clients.length === 0) {
    return new Response("No active window client to fetch MTProto chunks", { status: 503 });
  }

  const client = clients[0];
  const channel = new MessageChannel();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const stream = new ReadableStream({
    start(controller) {
      let bytesSent = 0;
      let isFirstChunk = true;

      channel.port1.onmessage = (e) => {
        const data = e.data;
        if (!data) return;

        if (data.type === "CHUNK_DATA") {
          let chunk = new Uint8Array(data.bytes);

          // If first chunk and start was not chunk-aligned, slice off the leading bytes
          if (isFirstChunk && skipInitialBytes > 0) {
            chunk = chunk.slice(skipInitialBytes);
            isFirstChunk = false;
          }

          // If chunk exceeds remaining needed bytes, slice to exact needed length
          const needed = contentLength - bytesSent;
          if (chunk.byteLength > needed) {
            chunk = chunk.slice(0, needed);
          }

          if (chunk.byteLength > 0) {
            controller.enqueue(chunk);
            bytesSent += chunk.byteLength;
          }

          if (bytesSent >= contentLength) {
            try {
              controller.close();
            } catch (err) {}
            channel.port1.close();
          }
        } else if (data.type === "CHUNK_END") {
          try {
            controller.close();
          } catch (err) {}
          channel.port1.close();
        } else if (data.type === "CHUNK_ERROR") {
          try {
            controller.error(new Error(data.error || "Chunk stream error"));
          } catch (err) {}
          channel.port1.close();
        }
      };

      // Send request to main thread to begin streaming chunks
      client.postMessage(
        {
          type: "FETCH_CHUNKS",
          requestId,
          channelId,
          messageId,
          startOffset: alignedStartOffset,
          endOffset: alignedEndOffset,
          chunkSize: CHUNK_SIZE,
          totalSize
        },
        [channel.port2]
      );
    },
    cancel(reason) {
      // Notify main thread to stop fetching if user pauses/scrubs
      try {
        channel.port1.postMessage({ type: "ABORT_STREAM", requestId });
        channel.port1.close();
      } catch (err) {}
    }
  });

  const headers = new Headers({
    "Content-Type": mimeType,
    "Accept-Ranges": "bytes",
    "Content-Length": String(contentLength),
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*"
  });

  if (isRange) {
    headers.set("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    return new Response(stream, {
      status: 206,
      statusText: "Partial Content",
      headers
    });
  } else {
    return new Response(stream, {
      status: 200,
      statusText: "OK",
      headers
    });
  }
}
