self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/stream/")) {
    event.respondWith(handleStreamRequest(event.request, url));
  }
});

async function handleStreamRequest(request, url) {
  const fileId = url.pathname.replace("/stream/", "");
  const rangeHeader = request.headers.get("Range");

  // Match all active window clients
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (!clients || clients.length === 0) {
    return new Response("No active window to fetch MTProto chunks", { status: 503 });
  }

  const client = clients[0];

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      const { status, headers, body, error } = event.data;
      if (error) {
        resolve(new Response(error, { status: 500 }));
        return;
      }

      resolve(
        new Response(body, {
          status: status || 200,
          headers: new Headers(headers),
        })
      );
    };

    client.postMessage(
      {
        type: "VAULTGRAM_STREAM_REQUEST",
        fileId,
        range: rangeHeader,
      },
      [channel.port2]
    );
  });
}
