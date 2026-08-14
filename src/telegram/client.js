import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { ConnectionTCPObfuscated } from "telegram/network";
import { PromisedWebSockets } from "telegram/extensions";
import { computeCheck } from "telegram/Password";
import { getSavedSession, getTgConfig, saveSession } from "./session.js";

// Official Telegram WebSocket Gateways for all 5 DCs
const DC_WEBSOCKET_DOMAINS = {
  1: "pluto.web.telegram.org",
  2: "venus.web.telegram.org",
  3: "aurora.web.telegram.org",
  4: "vesta.web.telegram.org",
  5: "flora.web.telegram.org",
};

export class TelegramBrowserWebSocket extends PromisedWebSockets {
  getWebSocketLink(ip, port, testServers) {
    for (const [dc, domain] of Object.entries(DC_WEBSOCKET_DOMAINS)) {
      if (ip.includes(domain) || String(ip) === String(dc)) {
        return `wss://${domain}/apiws${testServers ? "_test" : ""}`;
      }
    }
    if (ip.startsWith("149.154.175")) {
      return `wss://${DC_WEBSOCKET_DOMAINS[1]}/apiws${testServers ? "_test" : ""}`;
    }
    if (ip.startsWith("149.154.167")) {
      return `wss://${DC_WEBSOCKET_DOMAINS[2]}/apiws${testServers ? "_test" : ""}`;
    }
    if (ip.startsWith("91.108.56")) {
      return `wss://${DC_WEBSOCKET_DOMAINS[5]}/apiws${testServers ? "_test" : ""}`;
    }
    return `wss://${DC_WEBSOCKET_DOMAINS[5]}/apiws${testServers ? "_test" : ""}`;
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
    const config = getTgConfig();
    const stringSession = new StringSession(sessionStr || "");
    return new TelegramClient(stringSession, config.apiId, config.apiHash, {
      connection: ConnectionWebSocketObfuscated,
      connectionRetries: 5,
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

    this.isConnecting = true;
    this.notifyStatus();

    const sessionStr = getSavedSession();

    try {
      this.client = this.createClient(sessionStr);
      await this.client.connect();

      if (await this.client.isUserAuthorized()) {
        this.user = await this.client.getMe();
        this.isConnected = true;
        this.isConnecting = false;
        
        const currentSession = this.client.session.save();
        if (currentSession) {
          saveSession(currentSession);
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

  // 1. Send Login Code via Phone Number
  async sendCode(phoneNumber) {
    const config = getTgConfig();
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

  // 2. Sign In with Phone Code (using direct TL Api.auth.SignIn)
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
      saveSession(saved);
      this.user = await this.client.getMe();
      this.isConnected = true;
      this.notifyStatus();
      return this.user;
    } catch (err) {
      const errMsg = String(err.errorMessage || err.message || err);
      
      // Handle 2FA Password Requirement
      if (errMsg.includes("SESSION_PASSWORD_NEEDED")) {
        return await this.handle2FAPassword(password);
      }
      
      throw err;
    }
  }

  // 3. Handle 2FA Password Verification
  async handle2FAPassword(password = "") {
    const pass = password || prompt("Your account has 2FA enabled. Enter your 2FA Password:") || "";
    if (!pass) {
      throw new Error("2FA Password is required.");
    }

    const passwordSrpResult = await this.client.invoke(new Api.account.GetPassword());
    const passwordSrpCheck = await computeCheck(passwordSrpResult, pass);
    
    const checkResult = await this.client.invoke(
      new Api.auth.CheckPassword({
        password: passwordSrpCheck,
      })
    );

    const saved = this.client.session.save();
    saveSession(saved);
    this.user = await this.client.getMe();
    this.isConnected = true;
    this.notifyStatus();
    return this.user;
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
