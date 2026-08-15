import { useState, useEffect, useRef } from "react";
import { TelegramClient } from "telegram";
import { DriveFile } from "@/lib/telegram/indexer";
import { tgStreamClient } from "@/lib/telegram/client";

interface UseImagePreviewReturn {
  imageUrl: string | null;
  isLoading: boolean;
  error: string | null;
  dimensions: { width: number; height: number } | null;
  setDimensions: (dims: { width: number; height: number }) => void;
  retry: () => void;
}

/**
 * Fetches image bytes via MTProto and provides a memory-safe object URL.
 * Automatically revokes the Blob URL on unmount or file switch.
 */
export function useImagePreview(
  file: DriveFile | null,
  client: TelegramClient | null,
  isOpen: boolean
): UseImagePreviewReturn {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const activeUrlRef = useRef<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const retry = () => setRetryCount((prev) => prev + 1);

  useEffect(() => {
    // Teardown previous URL if exists
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
      setImageUrl(null);
    }

    if (!isOpen || !file || file.category !== "IMAGE") {
      setIsLoading(false);
      setError(null);
      setDimensions(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    async function fetchImage() {
      try {
        const tgClient = client || tgStreamClient.client;
        if (!tgClient) {
          throw new Error("Telegram client is not connected.");
        }

        // 1. Resolve channel entity
        let channelEntity: any = null;
        try {
          channelEntity = await tgClient.getEntity(parseInt(file!.channelId, 10));
        } catch {
          const dialogs = await tgClient.getDialogs();
          for (const d of dialogs) {
            if (d.entity && String(d.entity.id) === file!.channelId) {
              channelEntity = d.entity;
              break;
            }
          }
        }

        if (!channelEntity) {
          throw new Error(`Channel ${file!.channelTitle || file!.channelId} could not be resolved.`);
        }

        // 2. Fetch message object
        const messages = await tgClient.getMessages(channelEntity, {
          ids: [file!.messageId],
        });

        if (!messages || !messages[0] || !messages[0].media) {
          throw new Error("Message or media location not found on Telegram.");
        }

        const messageObj = messages[0];
        const media = messageObj.media;

        // 3. Download media buffer via GramJS MTProto
        const buffer = await tgClient.downloadMedia(media, {
          progressCallback: () => {},
        });

        if (!isMounted) return;

        if (!buffer || (buffer instanceof Uint8Array && buffer.byteLength === 0)) {
          throw new Error("Empty image payload received from Telegram.");
        }

        const mime = file!.mimeType || (media?.document?.mimeType) || "image/jpeg";
        const blob = new Blob([buffer], { type: mime });
        const objectUrl = URL.createObjectURL(blob);

        activeUrlRef.current = objectUrl;
        setImageUrl(objectUrl);
        setIsLoading(false);
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Failed to load image preview";
        setError(msg);
        setIsLoading(false);
      }
    }

    fetchImage();

    return () => {
      isMounted = false;
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
      }
    };
  }, [file?.id, file?.channelId, file?.messageId, client, isOpen, retryCount]);

  return {
    imageUrl,
    isLoading,
    error,
    dimensions,
    setDimensions,
    retry,
  };
}
