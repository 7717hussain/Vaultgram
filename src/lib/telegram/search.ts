import { TelegramClient, Api } from "telegram";
import { DriveFile, normalizeTelegramMessage } from "./indexer";
import { ChannelMeta } from "./session";

export interface RemoteSearchParams {
  client: TelegramClient;
  query: string;
  channel?: ChannelMeta;
  limit?: number;
}

/**
 * Searches Telegram remotely via MTProto RPC (messages.Search or messages.SearchGlobal)
 * to discover and index files not yet cached in local IndexedDB.
 */
export async function searchTelegramRemote({
  client,
  query,
  channel,
  limit = 50,
}: RemoteSearchParams): Promise<DriveFile[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  try {
    let result: any;

    if (channel && channel.id !== "UNIFIED") {
      // Channel-scoped search
      let entity: any = null;
      try {
        entity = await client.getEntity(parseInt(channel.id, 10));
      } catch {
        const dialogs = await client.getDialogs();
        for (const d of dialogs) {
          if (d.entity && String(d.entity.id) === channel.id) {
            entity = d.entity;
            break;
          }
        }
      }

      if (!entity) {
        console.warn(`[Search] Channel entity ${channel.id} could not be resolved.`);
        return [];
      }

      result = await client.invoke(
        new Api.messages.Search({
          peer: entity,
          q: cleanQuery,
          filter: new Api.InputMessagesFilterEmpty(),
          minDate: 0,
          maxDate: 0,
          offsetId: 0,
          addOffset: 0,
          limit,
          maxId: 0,
          minId: 0,
          hash: BigInt(0) as any,
        })
      );
    } else {
      // Global search across all dialogs
      result = await client.invoke(
        new Api.messages.SearchGlobal({
          q: cleanQuery,
          filter: new Api.InputMessagesFilterEmpty(),
          minDate: 0,
          maxDate: 0,
          offsetRate: 0,
          offsetPeer: new Api.InputPeerEmpty(),
          offsetId: 0,
          limit,
        })
      );
    }

    if (result && "messages" in result && Array.isArray(result.messages)) {
      const fallbackChannel: ChannelMeta = channel || {
        id: "UNIFIED",
        title: "Telegram Chat",
      };

      const foundFiles: DriveFile[] = [];
      for (const msg of result.messages) {
        const normalized = normalizeTelegramMessage(msg, fallbackChannel);
        if (normalized) {
          foundFiles.push(normalized);
        }
      }
      return foundFiles;
    }

    return [];
  } catch (error) {
    console.error("[Search] Remote MTProto search failed:", error);
    return [];
  }
}
