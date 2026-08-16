import { TelegramClient, Api } from "telegram";
import { DriveFile } from "./indexer";
import { useDriveStore } from "../stores/drive-store";
import { updateFileInDb } from "./session";

export interface RefreshedMediaMeta {
  location: Api.TypeInputFileLocation;
  dcId?: number;
  fileSize?: number;
  mimeType?: string;
}

/**
 * Re-fetches the Telegram message to obtain a fresh file_reference
 * when MTProto throws FILE_REFERENCE_EXPIRED or FILE_REFERENCE_EMPTY.
 * Uses dialogs cache first to prevent channels.GetFullChannel flood wait.
 */
export async function refreshFileLocation(
  client: TelegramClient,
  file: DriveFile
): Promise<RefreshedMediaMeta> {
  if (!file.messageId || !file.channelId) {
    throw new Error("Cannot refresh file reference: missing messageId or channelId");
  }

  const cleanId = file.channelId.replace(/^-100/, '');
  let channelEntity: any = null;

  // 1. Check client dialogs cache first (instant, 0 network requests, avoids flood wait)
  try {
    const dialogs = await client.getDialogs({});
    for (const d of dialogs) {
      if (d.entity) {
        const eid = String(d.entity.id).replace(/^-100/, '');
        if (eid === cleanId) {
          channelEntity = d.entity;
          break;
        }
      }
    }
  } catch {}

  // 2. Fallback to client.getEntity only if not in local cache
  if (!channelEntity) {
    try {
      channelEntity = await client.getEntity(parseInt(cleanId, 10));
    } catch {
      try {
        channelEntity = await client.getEntity(parseInt(`-100${cleanId}`, 10));
      } catch {}
    }
  }

  if (!channelEntity) {
    throw new Error(`Channel ${file.channelId} not found to refresh file reference`);
  }

  const messages = await client.getMessages(channelEntity, {
    ids: [file.messageId],
  });
  const freshMsg = messages && messages[0];

  if (!freshMsg || !("media" in freshMsg) || !freshMsg.media) {
    throw new Error("Message or media no longer exists on Telegram servers");
  }

  // 3. Extract updated media location from fresh message
  let freshLocation: Api.TypeInputFileLocation | null = null;
  let freshDcId: number | undefined = undefined;
  let freshSize = file.size;
  let freshMimeType = file.mimeType || "video/mp4";

  if (freshMsg.media instanceof Api.MessageMediaDocument && freshMsg.media.document instanceof Api.Document) {
    const doc = freshMsg.media.document;
    freshDcId = doc.dcId;
    freshSize = Number(doc.size || freshSize);
    freshMimeType = doc.mimeType || freshMimeType;
    freshLocation = new Api.InputDocumentFileLocation({
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
      thumbSize: "",
    });
  } else if (freshMsg.media instanceof Api.MessageMediaPhoto && freshMsg.media.photo instanceof Api.Photo) {
    const photo = freshMsg.media.photo;
    freshDcId = photo.dcId;
    const sizes = photo.sizes || [];
    const largestSize = sizes[sizes.length - 1];
    freshLocation = new Api.InputPhotoFileLocation({
      id: photo.id,
      accessHash: photo.accessHash,
      fileReference: photo.fileReference,
      thumbSize: (largestSize && "type" in largestSize ? largestSize.type : "w") || "w",
    });
  }

  if (!freshLocation) {
    throw new Error("Failed to extract valid InputFileLocation from fresh Telegram message");
  }

  // 4. Update local Zustand state and IndexedDB
  const locationObj = {
    id: freshLocation instanceof Api.InputDocumentFileLocation || freshLocation instanceof Api.InputPhotoFileLocation ? freshLocation.id : file.id,
    accessHash: freshLocation instanceof Api.InputDocumentFileLocation || freshLocation instanceof Api.InputPhotoFileLocation ? freshLocation.accessHash : file.accessHash,
    fileReference: freshLocation instanceof Api.InputDocumentFileLocation || freshLocation instanceof Api.InputPhotoFileLocation ? freshLocation.fileReference : file.fileReference,
    thumbSize: freshLocation instanceof Api.InputPhotoFileLocation ? freshLocation.thumbSize : "",
  };

  useDriveStore.getState().updateFile(file.id, {
    size: freshSize,
    mimeType: freshMimeType,
    dcId: freshDcId,
    location: locationObj,
    accessHash: locationObj.accessHash,
    fileReference: locationObj.fileReference,
  });

  const updatedFile: DriveFile = {
    ...file,
    size: freshSize,
    mimeType: freshMimeType,
    dcId: freshDcId,
    location: locationObj,
    accessHash: locationObj.accessHash,
    fileReference: locationObj.fileReference,
  };
  await updateFileInDb(updatedFile).catch(() => {});

  console.log(`[MediaRefresher] Successfully refreshed MTProto file reference for "${file.name}" (ID: ${file.id}, DC: ${freshDcId})`);

  return {
    location: freshLocation,
    dcId: freshDcId,
    fileSize: freshSize,
    mimeType: freshMimeType,
  };
}
