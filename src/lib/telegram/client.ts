// @ts-ignore - GramJS exports
import { TelegramClient, Api } from "telegram";
// @ts-ignore
import { StringSession } from "telegram/sessions";
// @ts-ignore
import { ConnectionTCPObfuscated } from "telegram/network";
// @ts-ignore
import { PromisedWebSockets } from "telegram/extensions";
// @ts-ignore
import { computeCheck } from "telegram/Password";
import {
  getSavedSession,
  getTgConfig,
  getTgConfigSync,
  setSavedSession,
  setSavedUserProfile,
  TelegramUserProfile,
  ChannelMeta,
} from "./session";

export class TelegramBrowserWebSocket extends PromisedWebSockets {
  getWebSocketLink(ip: string, _port: number, testServers?: boolean) {
    const testSuffix = testServers ? "_test" : "";

    // 1. If GramJS passed a full Telegram domain (e.g. pluto-1.web.telegram.org, flora-1.web.telegram.org), USE IT DIRECTLY!
    if (ip.includes("web.telegram.org") || ip.includes("telegram.org")) {
      return `wss://${ip}/apiws${testSuffix}`;
    }

    // 2. IP / DC Number to Telegram WebSocket Gateway Mapping
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
  constructor(args: any) {
    super({ ...args, socket: TelegramBrowserWebSocket });
  }
}

export type StatusListener = (status: {
  isConnected: boolean;
  isConnecting: boolean;
  user: TelegramUserProfile | null;
}) => void;

export class TgStreamClient {
  public client: any = null;
  public isConnected = false;
  public isConnecting = false;
  public user: TelegramUserProfile | null = null;
  public phoneCodeHash: string | null = null;
  public phoneNumber: string | null = null;

  private statusListeners = new Set<StatusListener>();
  public docCache = new Map<string, any>();
  public channelEntityCache = new Map<string, any>();
  public dcSenderCache = new Map<number, any>();

  onStatusChange(listener: StatusListener) {
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
      deviceModel: "Vaultgram React Web",
      systemVersion: "Web/Linux",
      appVersion: "2.0.0",
    });
  }

  private initPromise: Promise<boolean> | null = null;

  async init(): Promise<boolean> {
    if (this.client && this.isConnected && this.client.connected) return true;
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
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

        if (this.client) {
          try {
            await this.client.disconnect();
          } catch {}
          this.client = null;
        }

        this.client = this.createClient(sessionStr);

        const connectPromise = this.client.connect();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Telegram MTProto connection timeout")), 10000)
        );

        await Promise.race([connectPromise, timeoutPromise]);

        if (await this.client.isUserAuthorized()) {
          const me = await this.client.getMe();
          this.user = {
            id: String(me.id || ""),
            firstName: me.firstName || "",
            lastName: me.lastName || "",
            username: me.username || "",
            phone: me.phone || "",
          };
          this.isConnected = true;
          this.isConnecting = false;

          const currentSession = this.client.session.save();
          if (currentSession) {
            await setSavedSession(currentSession);
            await setSavedUserProfile(this.user);
          }

          this.notifyStatus();
          return true;
        } else {
          this.isConnected = false;
          this.isConnecting = false;
          this.notifyStatus();
          return false;
        }
      } catch (err: any) {
        console.error("[TgStreamClient] Failed to connect TelegramClient:", err);
        this.isConnected = false;
        this.isConnecting = false;
        this.notifyStatus();
        return false;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  // 1. High-Speed QR Code Login Flow
  async startQrLogin(
    onQrUrl: (url: string) => void,
    onNeeds2FA: (hint?: string) => Promise<string>
  ): Promise<{ session: string; user: TelegramUserProfile }> {
    const config = await getTgConfig();
    this.client = this.createClient("");

    const connectPromise = this.client.connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Telegram MTProto connection timed out")), 6000)
    );
    await Promise.race([connectPromise, timeoutPromise]);

    const apiId = Number(config.apiId);
    const apiHash = String(config.apiHash);

    try {
      let isScanningComplete = false;
      let user: any = null;

      const updateHandler = (update: any) => {
        if (update instanceof Api.UpdateLoginToken) {
          isScanningComplete = true;
        }
      };
      this.client.addEventHandler(updateHandler);

      const tokenLoop = async () => {
        while (!isScanningComplete && this.client) {
          try {
            const tokenRes: any = await this.client.invoke(
              new Api.auth.ExportLoginToken({
                apiId,
                apiHash,
                exceptIds: [],
              })
            );

            if (tokenRes instanceof Api.auth.LoginToken) {
              const rawTok = tokenRes.token;
              const base64 =
                typeof rawTok === "string"
                  ? rawTok
                  : Buffer.isBuffer(rawTok) || (rawTok && typeof rawTok === "object")
                  ? Buffer.from(rawTok).toString("base64")
                  : String(rawTok);

              const tokenStr = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
              const tgUrl = `tg://login?token=${tokenStr}`;
              if (onQrUrl) onQrUrl(tgUrl);

              const expires = tokenRes.expires || Date.now() / 1000 + 30;
              const waitSec = Math.max(5, Math.min(expires - Date.now() / 1000 - 3, 25));
              await new Promise((r) => setTimeout(r, waitSec * 1000));
            } else if (tokenRes instanceof Api.auth.LoginTokenSuccess) {
              isScanningComplete = true;
              user = (tokenRes.authorization as any).user;
              break;
            } else if (tokenRes instanceof Api.auth.LoginTokenMigrateTo) {
              await this.client._switchDC(tokenRes.dcId);
              const imported: any = await this.client.invoke(
                new Api.auth.ImportLoginToken({ token: tokenRes.token })
              );
              if (imported instanceof Api.auth.LoginTokenSuccess) {
                isScanningComplete = true;
                user = (imported.authorization as any).user;
                break;
              }
            }
          } catch (loopErr: any) {
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

      tokenLoop();

      while (!isScanningComplete && !user && this.client) {
        await new Promise((r) => setTimeout(r, 1200));
        try {
          const checkRes: any = await this.client.invoke(
            new Api.auth.ExportLoginToken({
              apiId,
              apiHash,
              exceptIds: [],
            })
          );
          if (checkRes instanceof Api.auth.LoginTokenSuccess) {
            user = (checkRes.authorization as any).user;
            isScanningComplete = true;
          } else if (checkRes instanceof Api.auth.LoginTokenMigrateTo) {
            await this.client._switchDC(checkRes.dcId);
            const imported: any = await this.client.invoke(
              new Api.auth.ImportLoginToken({ token: checkRes.token })
            );
            if (imported instanceof Api.auth.LoginTokenSuccess) {
              user = (imported.authorization as any).user;
              isScanningComplete = true;
            }
          }
        } catch (authErr: any) {
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

      const cleanUser: TelegramUserProfile = {
        id: String(user.id || ""),
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        username: user.username || "",
        phone: user.phone || "",
      };

      const saved = this.client.session.save();
      await setSavedSession(saved);
      this.user = cleanUser;
      await setSavedUserProfile(cleanUser);
      this.isConnected = true;
      this.notifyStatus();

      return { session: saved, user: cleanUser };
    } catch (err) {
      console.error("QR Login error:", err);
      throw err;
    }
  }

  // 2. Send Login Code via Phone Number
  async sendCode(phoneNumber: string) {
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

  // 3. Sign In with Phone Code
  async signIn(phoneCode: string, password = ""): Promise<TelegramUserProfile> {
    if (!this.client || !this.phoneCodeHash || !this.phoneNumber) {
      throw new Error("Please request a login code first.");
    }

    try {
      await this.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: this.phoneNumber,
          phoneCodeHash: this.phoneCodeHash,
          phoneCode: phoneCode.trim(),
        })
      );

      const me = await this.client.getMe();
      const cleanUser: TelegramUserProfile = {
        id: String(me.id || ""),
        firstName: me.firstName || "",
        lastName: me.lastName || "",
        username: me.username || "",
        phone: me.phone || "",
      };

      const saved = this.client.session.save();
      await setSavedSession(saved);
      this.user = cleanUser;
      await setSavedUserProfile(cleanUser);
      this.isConnected = true;
      this.notifyStatus();
      return cleanUser;
    } catch (err: any) {
      const errMsg = String(err.errorMessage || err.message || err);
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
  async signInWithPassword(password: string): Promise<TelegramUserProfile> {
    const passStr = String(password || "").trim();
    if (!passStr) {
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

      const me =
        checkRes.user ||
        (checkRes.authorization && checkRes.authorization.user) ||
        (await this.client.getMe());
      const cleanUser: TelegramUserProfile = {
        id: String(me.id || ""),
        firstName: me.firstName || "",
        lastName: me.lastName || "",
        username: me.username || "",
        phone: me.phone || "",
      };

      const saved = this.client.session.save();
      await setSavedSession(saved);
      this.user = cleanUser;
      await setSavedUserProfile(cleanUser);
      this.isConnected = true;
      this.notifyStatus();
      return cleanUser;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("PASSWORD_HASH_INVALID")) {
        throw new Error("Invalid Two-Step Verification password");
      }
      if (message.includes("FLOOD_WAIT")) {
        throw new Error("Too many attempts. Please wait a few minutes.");
      }
      console.error("Failed to sign in with password:", err);
      throw new Error(message || "Failed to sign in with 2FA password");
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

  // Fetch all user channels/chats with access hashes and Saved Messages
  async getUserChannels(): Promise<ChannelMeta[]> {
    if (!this.client || !this.isConnected) {
      const ok = await this.init();
      if (!ok) throw new Error("Client is not connected to Telegram.");
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const dialogs = await this.client.getDialogs({ limit: 100 });
        const channels: ChannelMeta[] = [];

        for (const d of dialogs) {
          const entity = d.entity;
          if (!entity) continue;

          const idStr = String(entity.id || d.id || "");
          if (!idStr) continue;

          this.channelEntityCache.set(idStr, entity);

          // Include channels, supergroups, and Saved Messages / self chat
          const isChannelOrGroup = d.isChannel || d.isGroup || entity.className === "Channel" || entity.className === "Chat";
          const isSelf = d.isUser && (entity.isSelf || entity.self || idStr === this.user?.id);

          if (isChannelOrGroup || isSelf) {
            const title = isSelf
              ? "Saved Messages"
              : d.title || entity.title || entity.firstName || "Untitled Channel";

            channels.push({
              id: idStr,
              title,
              username: entity.username || null,
              unreadCount: d.unreadCount || 0,
              accessHash: entity.accessHash ? String(entity.accessHash) : undefined,
              isSelf,
            });
          }
        }

        // Deduplicate
        const unique = new Map<string, ChannelMeta>();
        for (const ch of channels) {
          if (!unique.has(ch.id)) {
            unique.set(ch.id, ch);
          }
        }

        return Array.from(unique.values());
      } catch (err: any) {
        const msg = String(err.message || err);
        if (msg.includes("FLOOD_WAIT_")) {
          const waitSec = parseInt(msg.match(/FLOOD_WAIT_(\d+)/)?.[1] || "5", 10);
          console.warn(`[getUserChannels] Flood wait: waiting ${waitSec}s...`);
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }
        if (msg.includes("AUTH_KEY_DUPLICATED")) {
          console.warn("[getUserChannels] AUTH_KEY_DUPLICATED detected. Reconnecting singleton client...");
          this.isConnected = false;
          await this.init();
          continue;
        }
        if (attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return [];
  }
}

export const tgStreamClient = new TgStreamClient();
