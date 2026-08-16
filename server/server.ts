import express from 'express';
import cors from 'cors';
import { TelegramClient, Api, sessions } from 'telegram';
const { StringSession } = sessions;
import bigInt from 'big-integer';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());

// Telegram Production DC TCP IP Mapping for Node.js
const DC_IP_MAP: Record<number, string> = {
  1: "149.154.175.53",
  2: "149.154.167.51",
  3: "149.154.175.100",
  4: "149.154.167.91",
  5: "91.108.56.130",
};

const clientCache = new Map<string, TelegramClient>();
const clientConnecting = new Map<string, Promise<TelegramClient>>();

async function getOrCreateClient(sessionStr: string, dcIdStr?: string): Promise<TelegramClient> {
  const existing = clientCache.get(sessionStr);
  if (existing) return existing;

  const inFlight = clientConnecting.get(sessionStr);
  if (inFlight) return inFlight;

  const connectPromise = (async () => {
    try {
      const apiId = parseInt(process.env.VITE_TELEGRAM_API_ID || "2040", 10);
      const apiHash = process.env.VITE_TELEGRAM_API_HASH || "b18441a1ff607e10a989891a5462e627";

      const stringSession = new StringSession(sessionStr);
      const targetDc = stringSession.dcId || parseInt(dcIdStr || "2", 10);
      const realIp = DC_IP_MAP[targetDc] || DC_IP_MAP[2];
      stringSession.setDC(targetDc, realIp, 443);

      const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
      });
      await client.connect();
      clientCache.set(sessionStr, client);
      clientConnecting.delete(sessionStr);
      console.log(`[Daemon] Telegram Client connected to DC ${targetDc} (${realIp}:443)`);
      return client;
    } catch (err) {
      clientConnecting.delete(sessionStr);
      throw err;
    }
  })();

  clientConnecting.set(sessionStr, connectPromise);
  return connectPromise;
}

// Prevent Node.js from crashing on background errors
process.on('uncaughtException', (err) => console.error('[Fatal Node Error]:', err));
process.on('unhandledRejection', (reason) => console.error('[Unhandled Promise]:', reason));

async function getChannelEntitySafe(client: TelegramClient, channelId: string) {
  const cleanId = channelId.replace(/^-100/, '');
  try {
    const dialogs = await client.getDialogs({});
    for (const d of dialogs) {
      if (d.entity) {
        const eid = String(d.entity.id).replace(/^-100/, '');
        if (eid === cleanId) return d.entity;
      }
    }
  } catch {}
  try {
    return await client.getEntity(parseInt(cleanId, 10));
  } catch {}
  try {
    return await client.getEntity(parseInt(`-100${cleanId}`, 10));
  } catch {}
  return null;
}

app.get('/stream', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).send('Method Not Allowed');
  }

  const { session, dcId, id, msgId, accessHash, fileReference, size, mimeType, channelId } = req.query;
  const fileId = id || msgId;

  if (!session || !fileId || !size) {
    console.error("[Daemon] 400 Bad Request - Missing Essential Parameters");
    return res.status(400).send("Missing parameters");
  }

  const fileSize = parseInt(size as string, 10);

  if (req.method === 'HEAD') {
    res.writeHead(200, {
      'Content-Length': String(fileSize),
      'Accept-Ranges': 'bytes',
      'Content-Type': (mimeType as string) || 'video/mp4',
    });
    return res.end();
  }

  let range = req.headers.range;
  let start = 0;
  let end = fileSize - 1;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    start = parseInt(parts[0], 10);
    end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
  }

  const chunksize = (end - start) + 1;

  try {
    const client = await getOrCreateClient(session as string, dcId as string);

    let targetDcId = parseInt((dcId as string) || "2", 10);
    let fileLoc: Api.TypeInputFileLocation | null = null;

    // 1. Direct Location Rehydration if valid hashes provided
    const hasValidAccessHash = accessHash && accessHash !== "0" && accessHash !== "undefined";
    const hasValidFileRef = fileReference && fileReference !== "" && fileReference !== "undefined";

    if (hasValidAccessHash && hasValidFileRef) {
      const sanitizedFileRef = (fileReference as string).replace(/ /g, '+');
      fileLoc = new Api.InputDocumentFileLocation({
        id: bigInt(fileId as string),
        accessHash: bigInt(accessHash as string),
        fileReference: Buffer.from(sanitizedFileRef, 'base64'),
        thumbSize: "",
      });
    }

    // 2. Fallback: Auto-fetch from Telegram channel if hashes missing
    if (!fileLoc && channelId && (msgId || id)) {
      const targetMsgId = parseInt((msgId || id) as string, 10);
      console.log(`[Daemon] Hashes missing in request. Auto-resolving from channel ${channelId}, msg ${targetMsgId}...`);
      try {
        const entity = await getChannelEntitySafe(client, channelId as string);
        if (entity) {
          const messages = await client.getMessages(entity, { ids: [targetMsgId] });
          const doc = (messages?.[0]?.media as any)?.document;
          if (doc) {
            fileLoc = new Api.InputDocumentFileLocation({
              id: doc.id,
              accessHash: doc.accessHash,
              fileReference: doc.fileReference,
              thumbSize: "",
            });
            if (doc.dcId) targetDcId = doc.dcId;
            console.log(`[Daemon] Media resolved: Doc ID ${doc.id}, DC ${targetDcId}`);
          }
        }
      } catch (err) {
        console.warn("[Daemon] Failed to resolve channel message:", err);
      }
    }

    if (!fileLoc) {
      console.error("[Daemon] 400 Bad Request - Could not construct InputFileLocation");
      return res.status(400).send("Unable to construct valid file location");
    }

    const headers: Record<string, string | number> = {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(chunksize),
      'Content-Type': (mimeType as string) || 'video/mp4',
    };

    if (range) {
      headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
    }

    res.writeHead(range ? 206 : 200, headers);

    let bytesSent = 0;
    let currentLogicalOffset = start;

    console.log(`[Daemon] Streaming Doc ${fileId} | Range: ${start}-${end}/${fileSize}`);

    while (bytesSent < chunksize) {
      if (res.destroyed || res.writableEnded) {
        console.log(`[Daemon] Client aborted stream for Doc ${fileId}.`);
        break;
      }

      const alignedOffset = Math.floor(currentLogicalOffset / 4096) * 4096;
      let bytesToSkip = currentLogicalOffset - alignedOffset;

      try {
        const iterator = client.iterDownload({
          file: fileLoc,
          offset: bigInt(alignedOffset),
          requestSize: 512 * 1024,
          dcId: targetDcId,
          fileSize: bigInt(fileSize),
        });

        for await (let chunk of iterator) {
          if (res.destroyed || res.writableEnded) break;
          if (bytesSent >= chunksize) break;

          if (bytesToSkip > 0) {
            if (chunk.length <= bytesToSkip) {
              bytesToSkip -= chunk.length;
              continue;
            } else {
              chunk = chunk.slice(bytesToSkip);
              bytesToSkip = 0;
            }
          }

          const bytesNeeded = chunksize - bytesSent;
          const payload = chunk.length > bytesNeeded ? chunk.slice(0, bytesNeeded) : chunk;

          const canWrite = res.write(payload);
          bytesSent += payload.length;
          currentLogicalOffset += payload.length;

          if (!canWrite) {
            await new Promise<void>((resolve) => {
              res.once('drain', resolve);
              res.once('error', resolve);
              res.once('close', resolve);
            });
          }
        }

        break; // Successfully finished entire chunk
      } catch (err: any) {
        const errMsg = String(err?.message || err);
        console.warn(`[Daemon] Error during stream loop at offset ${currentLogicalOffset}: ${errMsg}`);

        if (res.destroyed || res.writableEnded) break;

        // Auto-heal on expired file reference: query message and continue stream without closing response
        if ((errMsg.includes("FILE_REFERENCE_EXPIRED") || errMsg.includes("FILE_REFERENCE_EMPTY")) && channelId && (msgId || id)) {
          const targetMsgId = parseInt((msgId || id) as string, 10);
          console.log(`[Daemon] FILE_REFERENCE_EXPIRED caught. Auto-refreshing from channel ${channelId}, msg ${targetMsgId}...`);
          try {
            const entity = await getChannelEntitySafe(client, channelId as string);
            if (entity) {
              const messages = await client.getMessages(entity, { ids: [targetMsgId] });
              const freshMsg = messages && messages[0];
              const doc = (freshMsg?.media as any)?.document;
              if (doc) {
                fileLoc = new Api.InputDocumentFileLocation({
                  id: doc.id,
                  accessHash: doc.accessHash,
                  fileReference: doc.fileReference,
                  thumbSize: "",
                });
                if (doc.dcId) targetDcId = doc.dcId;
                console.log(`[Daemon] Fresh fileReference acquired! Seamlessly resuming stream at offset ${currentLogicalOffset}...`);
                continue; // Resume while loop at currentLogicalOffset
              }
            }
          } catch (refreshErr) {
            console.error("[Daemon] Recovery refresh failed:", refreshErr);
          }
        }

        throw err;
      }
    }

    if (!res.writableEnded) res.end();

  } catch (err: any) {
    console.error("\n❌ [Daemon Stream Error]:", err?.message || err);
    if (!res.headersSent) {
      res.status(500).end();
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Vaultgram Local Daemon running on http://localhost:${PORT}`);
});
