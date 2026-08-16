import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { ConnectionTCPObfuscated } from "telegram/network";
import { PromisedWebSockets } from "telegram/extensions";
import { computeCheck } from "telegram/Password";
import { getSavedSession, getTgConfig, getTgConfigSync, setSavedSession, setSavedUserProfile } from "./session.js";

// Official Telegram WebSocket Gateways for all 5 DCs
const DC_WEBSOCKET_DOMAINS = {
  1: "pluto.web.telegram.org",
  2: "venus.web.telegram.org",
  3: "aurora.web.telegram.org",
  4: "vesta.web.telegram.org",
  5: "flora.web.telegram.org",
};

export class TelegramBrowserWebSocket extends PromisedWebSockets {
  getWebSocketLink(ip, _port, testServers) {
    const testSuffix = testServers ? "_test" : "";

    if (ip.includes("web.telegram.org") || ip.includes("telegram.org")) {
      return `wss://${ip}/apiws${testSuffix}`;
    }

    if (ip.startsWith("149.154.175") || String(ip) === "1" || ip.includes("pluto")) {
      return `wss://pluto.web.telegram.org/apiws${testSuffix}`;
    }
    if (ip.startsWith("149.154.167.5") || String(ip) === "2" || ip.includes("venus")) {
      return `wss://venus.web.telegram.org/apiws${testSuffix}`;
    }
    if (ip.startsWith("149.154.175.1") || String(ip) === "3" || ip.includes("aurora")) {
      return `wss://aurora.web.telegram.org/apiws${testSuffix}`;
    }
    if (ip.startsWith("149.154.167.9") || ip.includes("149.154.167") || String(ip) === "4" || ip.includes("vesta")) {
      return `wss://vesta.web.telegram.org/apiws${testSuffix}`;
    }
    if (ip.startsWith("91.108.56") || String(ip) === "5" || ip.includes("flora")) {
      return `wss://flora.web.telegram.org/apiws${testSuffix}`;
    }

    return `wss://vesta.web.telegram.org/apiws${testSuffix}`;
  }
}

export class ConnectionWebSocketObfuscated extends ConnectionTCPObfuscated {
  constructor(args) {
    super({ ...args, socket: TelegramBrowserWebSocket });
  }
}

class TgStreamClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.user = null;
    this.phoneCodeHash = null;
    this.phoneNumber = null;
    this.statusListeners = new Set();
    
    this.docCache = new Map();
    this.channelEntityCache = new Map();
    this.dcSenderCache = new Map();
  }

  onStatusChange(listener) {
    this.statusListeners.add(listener);
    listener({ isConnected: this.isConnected, isConnecting: this.isConnecting, user: this.user });
    return () => this.statusListeners.delete(listener);
  }

  notifyStatus() {
    for (const listener of this.statusListeners) {
      listener({ isConnected: this.isConnected, isConnecting: this.isConnecting, user: this.user });
    }
  }

  createClient(sessionStr = "") {
    const config = getTgConfigSync();
    const stringSession = new StringSession(sessionStr || "");
    if (!sessionStr) {
      // Pre-assign primary production DC 4 for instant WebSocket handshake
      stringSession.setDC(4, "149.154.167.91", 443);
    }
    return new TelegramClient(stringSession, Number(config.apiId), String(config.apiHash), {
      connection: ConnectionWebSocketObfuscated,
      connectionRetries: 3,
      useWSS: true,
      autoReconnect: true,
      deviceModel: "Vaultgram Web Client",
      systemVersion: "Web/Linux",
      appVersion: "1.0.0",
    });
  }

  async init() {
    if (this.client && this.isConnected) return true;
    if (this.isConnecting) return false;

    const sessionStr = await getSavedSession();
    if (!sessionStr) {
      this.isConnected = false;
      this.isConnecting = false;
      this.notifyStatus();
      return false;
    }

    const config = await getTgConfig();
    if (!config.apiId || !config.apiHash) {
      this.isConnected = false;
      this.isConnecting = false;
      this.notifyStatus();
      return false;
    }

    this.isConnecting = true;
    this.notifyStatus();

    try {
      this.client = this.createClient(sessionStr);
      
      // Connect with 8s timeout to prevent hanging UI
      const connectPromise = this.client.connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Telegram MTProto connection timeout")), 8000)
      );

      await Promise.race([connectPromise, timeoutPromise]);

      if (await this.client.isUserAuthorized()) {
        this.user = await this.client.getMe();
        this.isConnected = true;
        this.isConnecting = false;
        
        const currentSession = this.client.session.save();
        if (currentSession) {
          await setSavedSession(currentSession);
          await setSavedUserProfile(this.user);
        }
        
        this.notifyStatus();
        console.log(`[TgStreamClient] Connected as: ${this.user.firstName} (@${this.user.username})`);
        return true;
      } else {
        this.isConnected = false;
        this.isConnecting = false;
        this.notifyStatus();
        return false;
      }
    } catch (err) {
      console.error("[TgStreamClient] Failed to connect TelegramClient:", err);
      this.isConnected = false;
      this.isConnecting = false;
      this.notifyStatus();
      return false;
    }
  }

  // 1. QR Code Login Flow (Direct High-Speed MTProto Token Stream)
  async startQrLogin(onQrUrl, onNeeds2FA) {
    const config = await getTgConfig();
    this.client = this.createClient("");
    
    // Connect with 6s timeout
    const connectPromise = this.client.connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Telegram MTProto connection timed out. Please check network.")), 6000)
    );
    await Promise.race([connectPromise, timeoutPromise]);

    const apiId = Number(config.apiId);
    const apiHash = String(config.apiHash);

    try {
      let isScanningComplete = false;
      let user = null;

      // Listen for background device authorization events
      const updateHandler = (update) => {
        if (update instanceof Api.UpdateLoginToken) {
          isScanningComplete = true;
        }
      };
      this.client.addEventHandler(updateHandler);

      // Loop: Continually fetch / refresh token until scanned
      const tokenLoop = async () => {
        while (!isScanningComplete && this.client) {
          try {
            const tokenRes = await this.client.invoke(
              new Api.auth.ExportLoginToken({
                apiId,
                apiHash,
                exceptIds: [],
              })
            );

            if (tokenRes instanceof Api.auth.LoginToken) {
              const rawTok = tokenRes.token;
              const base64 = Buffer.isBuffer(rawTok) || rawTok instanceof Uint8Array
                ? Buffer.from(rawTok).toString("base64")
                : typeof rawTok === "string" ? rawTok : String(rawTok);
              
              const tokenStr = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
              const tgUrl = `tg://login?token=${tokenStr}`;
              if (onQrUrl) onQrUrl(tgUrl);

              const expires = tokenRes.expires || (Date.now() / 1000 + 30);
              const waitSec = Math.max(5, Math.min(expires - Date.now() / 1000 - 3, 25));
              await new Promise((r) => setTimeout(r, waitSec * 1000));
            } else if (tokenRes instanceof Api.auth.LoginTokenSuccess) {
              isScanningComplete = true;
              user = tokenRes.authorization.user;
              break;
            } else if (tokenRes instanceof Api.auth.LoginTokenMigrateTo) {
              await this.client._switchDC(tokenRes.dcId);
              const imported = await this.client.invoke(
                new Api.auth.ImportLoginToken({ token: tokenRes.token })
              );
              if (imported instanceof Api.auth.LoginTokenSuccess) {
                isScanningComplete = true;
                user = imported.authorization.user;
                break;
              }
            }
          } catch (loopErr) {
            const msg = String(loopErr.errorMessage || loopErr.message || loopErr);
            if (msg.includes("SESSION_PASSWORD_NEEDED")) {
              isScanningComplete = true;
              if (onNeeds2FA) {
                const pass = await onNeeds2FA();
                if (pass) {
                  user = await this.signInWithPassword(pass);
                  break;
                }
              }
            }
            if (isScanningComplete) break;
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      };

      // Launch token emission in background
      tokenLoop();

      // Wait loop for completion
      while (!isScanningComplete && !user && this.client) {
        await new Promise((r) => setTimeout(r, 1200));
        try {
          const checkRes = await this.client.invoke(
            new Api.auth.ExportLoginToken({
              apiId,
              apiHash,
              exceptIds: [],
            })
          );
          if (checkRes instanceof Api.auth.LoginTokenSuccess) {
            user = checkRes.authorization.user;
            isScanningComplete = true;
          } else if (checkRes instanceof Api.auth.LoginTokenMigrateTo) {
            await this.client._switchDC(checkRes.dcId);
            const imported = await this.client.invoke(
              new Api.auth.ImportLoginToken({ token: checkRes.token })
            );
            if (imported instanceof Api.auth.LoginTokenSuccess) {
              user = imported.authorization.user;
              isScanningComplete = true;
            }
          }
        } catch (authErr) {
          const msg = String(authErr.errorMessage || authErr.message || authErr);
          if (msg.includes("SESSION_PASSWORD_NEEDED")) {
            isScanningComplete = true;
            if (onNeeds2FA) {
              const pass = await onNeeds2FA();
              if (pass) {
                user = await this.signInWithPassword(pass);
                break;
              }
            }
          }
        }
      }

      this.client.removeEventHandler(updateHandler);

      if (!user) {
        user = await this.client.getMe();
      }

      const saved = this.client.session.save();
      await setSavedSession(saved);
      this.user = user;
      await setSavedUserProfile(this.user);
      this.isConnected = true;
      this.notifyStatus();
      return { session: saved, user: this.user };
    } catch (err) {
      console.error("QR Login error:", err);
      throw err;
    }
  }

  // 2. Send Login Code via Phone Number
  async sendCode(phoneNumber) {
    const config = await getTgConfig();
    this.phoneNumber = phoneNumber.trim();
    this.client = this.createClient("");
    await this.client.connect();

    const res = await this.client.sendCode(
      {
        apiId: config.apiId,
        apiHash: config.apiHash,
      },
      this.phoneNumber
    );

    this.phoneCodeHash = res.phoneCodeHash;
    return res;
  }

  // 3. Sign In with Phone Code (using direct TL Api.auth.SignIn)
  async signIn(phoneCode, password = "") {
    if (!this.client || !this.phoneCodeHash || !this.phoneNumber) {
      throw new Error("Please request a login code first.");
    }

    try {
      const result = await this.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: this.phoneNumber,
          phoneCodeHash: this.phoneCodeHash,
          phoneCode: phoneCode.trim(),
        })
      );

      // Successfully signed in
      const saved = this.client.session.save();
      await setSavedSession(saved);
      this.user = await this.client.getMe();
      await setSavedUserProfile(this.user);
      this.isConnected = true;
      this.notifyStatus();
      return this.user;
    } catch (err) {
      const errMsg = String(err.errorMessage || err.message || err);
      
      // Handle 2FA Password Requirement
      if (errMsg.includes("SESSION_PASSWORD_NEEDED")) {
        if (password) {
          return await this.signInWithPassword(password);
        }
        throw new Error("SESSION_PASSWORD_NEEDED");
      }
      
      throw err;
    }
  }

  // 4. Handle 2FA Password Verification
  async signInWithPassword(password) {
    const passStr = String(password || "");
    if (!passStr.trim()) {
      throw new Error("2FA Password is required.");
    }

    try {
      const passwordSrpResult = await this.client.invoke(new Api.account.GetPassword());
      const passwordSrpCheck = await computeCheck(passwordSrpResult, passStr);
      
      const checkRes = await this.client.invoke(
        new Api.auth.CheckPassword({
          password: passwordSrpCheck,
        })
      );

      const user = checkRes.user || (checkRes.authorization && checkRes.authorization.user) || await this.client.getMe();
      const saved = this.client.session.save();
      await setSavedSession(saved);
      this.user = user;
      await setSavedUserProfile(this.user);
      this.isConnected = true;
      this.notifyStatus();
      return this.user;
    } catch (err) {
      console.error("Failed to sign in with password:", err);
      throw err;
    }
  }

  async destroy() {
    try {
      if (this.client) {
        await this.client.disconnect();
        await this.client.destroy();
      }
    } catch (e) {
      console.warn("Client destroy warning:", e);
    }
    this.client = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.user = null;
    this.notifyStatus();
  }

  // 4. Fetch and categorize user's channels (Public vs Private)
  async getUserChannels() {
    if (!this.client || !this.isConnected) {
      const ok = await this.init();
      if (!ok) throw new Error("Client is not connected to Telegram.");
    }

    const dialogs = await this.client.getDialogs({ limit: 100 });
    const publicChannels = [];
    const privateChannels = [];

    for (const d of dialogs) {
      if (d.isChannel || d.isGroup) {
        const entity = d.entity;
        if (!entity) continue;

        // Cache entity for quick streaming reference
        const idStr = String(entity.id);
        this.channelEntityCache.set(idStr, entity);

        const channelInfo = {
          id: idStr,
          title: d.title || entity.title || "Untitled Channel",
          username: entity.username || null,
          isPublic: !!entity.username,
          unreadCount: d.unreadCount || 0,
          rawEntity: entity,
        };

        if (channelInfo.isPublic) {
          publicChannels.push(channelInfo);
        } else {
          privateChannels.push(channelInfo);
        }
      }
    }

    return { publicChannels, privateChannels };
  }

  // 5. Fetch media messages from a specific channel and classify file types
  async getChannelMediaMessages(channelId, limit = 150) {
    if (!this.client || !this.isConnected) {
      await this.init();
    }

    const channelEntity = await this.getChannelEntity(channelId);
    const messages = await this.client.getMessages(channelEntity, {
      limit,
    });

    const items = [];

    for (const msg of messages) {
      if (!msg.media) continue;

      let doc = null;
      let isPhoto = false;

      if (msg.media.document) {
        doc = msg.media.document;
      } else if (msg.media.photo) {
        isPhoto = true;
      }

      if (!doc && !isPhoto) continue;

      const messageId = msg.id;
      let fileName = msg.file?.name || "";
      const mimeType = doc?.mimeType || (isPhoto ? "image/jpeg" : "application/octet-stream");
      const size = Number(doc?.size || 0);

      // If no file name, infer from message text or format
      if (!fileName) {
        const textSnippet = (msg.message || "").trim().slice(0, 35).replace(/[^\w\s-]/g, "");
        if (textSnippet) {
          fileName = textSnippet;
        } else if (isPhoto) {
          fileName = `photo_${messageId}.jpg`;
        } else if (mimeType.includes("video")) {
          fileName = `video_${messageId}.mp4`;
        } else if (mimeType.includes("audio")) {
          fileName = `audio_${messageId}.mp3`;
        } else {
          fileName = `file_${messageId}`;
        }
      }

      // Categorize into standard File Types (video, audio, archive, image, document, other)
      const ext = fileName.split(".").pop().toLowerCase();
      let category = "document";

      if (
        mimeType.startsWith("video/") ||
        ["mp4", "mkv", "webm", "avi", "mov", "flv", "m4v", "ts"].includes(ext)
      ) {
        category = "videos";
      } else if (
        mimeType.startsWith("audio/") ||
        ["mp3", "m4a", "wav", "flac", "ogg", "aac", "opus"].includes(ext)
      ) {
        category = "audio";
      } else if (
        ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso"].includes(ext) ||
        mimeType.includes("zip") ||
        mimeType.includes("compressed") ||
        mimeType.includes("tar")
      ) {
        category = "archives";
      } else if (
        isPhoto ||
        mimeType.startsWith("image/") ||
        ["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp"].includes(ext)
      ) {
        category = "images";
      } else if (["pdf", "epub", "doc", "docx", "txt", "ppt", "pptx"].includes(ext)) {
        category = "documents";
      } else {
        category = "other";
      }

      items.push({
        id: `${channelId}_${messageId}`,
        messageId,
        channelId: String(channelId),
        title: fileName,
        fileName,
        caption: msg.message || "",
        date: msg.date,
        mimeType,
        size,
        category,
        streamUrl: `/stream/${channelId}/${messageId}?size=${size}&mime=${encodeURIComponent(mimeType)}`,
      });
    }

    return items;
  }

  async getChannelEntity(channelId) {
    const key = String(channelId);
    if (this.channelEntityCache.has(key)) {
      return this.channelEntityCache.get(key);
    }

    try {
      const entity = await this.client.getEntity(parseInt(channelId, 10));
      this.channelEntityCache.set(key, entity);
      return entity;
    } catch (e) {
      const dialogs = await this.client.getDialogs();
      for (const d of dialogs) {
        if (d.entity && String(d.entity.id) === key) {
          this.channelEntityCache.set(key, d.entity);
          return d.entity;
        }
      }
      throw e;
    }
  }

  async getDocumentMetadata(channelId, messageId, forceRefresh = false) {
    const cacheKey = `${channelId}_${messageId}`;
    if (!forceRefresh && this.docCache.has(cacheKey)) {
      return this.docCache.get(cacheKey);
    }

    const channelEntity = await this.getChannelEntity(channelId);
    const messages = await this.client.getMessages(channelEntity, {
      ids: [parseInt(messageId, 10)],
    });

    if (!messages || messages.length === 0 || !messages[0] || !messages[0].media) {
      throw new Error(`Message ${messageId} or media not found in channel ${channelId}`);
    }

    const msg = messages[0];
    const doc = msg.media.document;
    if (!doc) {
      throw new Error(`Message ${messageId} contains no document/video media`);
    }

    const location = new Api.InputDocumentFileLocation({
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
      thumbSize: "",
    });

    const meta = {
      location,
      dcId: doc.dcId || this.client.session.dcId,
      size: Number(doc.size),
      mimeType: doc.mimeType || "video/mp4",
      fileName: msg.file?.name || `lecture_${messageId}.mp4`,
    };

    this.docCache.set(cacheKey, meta);
    return meta;
  }

  async getDcSender(dcId) {
    if (!dcId || dcId === this.client.session.dcId) {
      return this.client;
    }
    if (this.dcSenderCache.has(dcId)) {
      return this.dcSenderCache.get(dcId);
    }

    try {
      const sender = await this.client.getSender(dcId);
      this.dcSenderCache.set(dcId, sender);
      return sender;
    } catch (err) {
      console.warn(`[getDcSender] Fallback to main client for DC ${dcId}:`, err);
      return this.client;
    }
  }

  async fetchChunk(channelId, messageId, offset, limit) {
    if (!this.isConnected) {
      await this.init();
    }

    const safeOffset = BigInt(Math.floor(offset / 4096) * 4096);
    const safeLimit = Math.min(1048576, Math.floor(limit / 4096) * 4096 || 4096);

    let meta = await this.getDocumentMetadata(channelId, messageId);
    const sender = await this.getDcSender(meta.dcId);

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const req = new Api.upload.GetFile({
          location: meta.location,
          offset: safeOffset,
          limit: safeLimit,
          precise: true,
          cdnSupported: false,
        });

        const result = sender.send ? await sender.send(req) : await this.client.invoke(req);

        if (result && result.bytes) {
          return result.bytes;
        }
        return new Uint8Array(0);
      } catch (err) {
        const errMsg = String(err.message || err);
        console.warn(`[GetFile Attempt ${attempt + 1}] Error on msg ${messageId}:`, errMsg);

        if (err.newDc || errMsg.includes("stored in DC")) {
          const targetDc = err.newDc || parseInt(errMsg.match(/DC\s*(\d+)/i)?.[1] || "4", 10);
          console.log(`[GetFile] Switching to DC ${targetDc}...`);
          meta.dcId = targetDc;
          const newSender = await this.getDcSender(targetDc);
          const req = new Api.upload.GetFile({
            location: meta.location,
            offset: safeOffset,
            limit: safeLimit,
            precise: true,
            cdnSupported: false,
          });
          const res = newSender.send ? await newSender.send(req) : await this.client.invoke(req);
          if (res && res.bytes) return res.bytes;
        }

        if (errMsg.includes("FILE_REFERENCE_EXPIRED") || errMsg.includes("FILE_REFERENCE_INVALID")) {
          meta = await this.getDocumentMetadata(channelId, messageId, true);
          continue;
        }

        if (errMsg.includes("FLOOD_WAIT_")) {
          const seconds = parseInt(errMsg.split("FLOOD_WAIT_")[1], 10) || 4;
          console.warn(`Rate limit: Waiting ${seconds}s...`);
          await new Promise((r) => setTimeout(r, seconds * 1000));
          continue;
        }

        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    throw new Error("Failed to fetch chunk after retries");
  }
}

export const tgStreamClient = new TgStreamClient();
