import { Api } from "telegram";
import { DriveFile } from "../indexer";
import bigInt from "big-integer";

function toBigIntSafe(val: any): bigInt.BigInteger {
  if (!val) return bigInt(0);
  if (bigInt.isInstance(val)) return val;
  if (typeof val === "bigint") return bigInt(val.toString());
  if (typeof val === "number") return bigInt(val);
  if (typeof val === "string") {
    try {
      return bigInt(val);
    } catch (_) {
      return bigInt(0);
    }
  }
  if (typeof val === "object") {
    if (val.value !== undefined) return toBigIntSafe(val.value);
    if (val.low !== undefined && val.high !== undefined) {
      // Long.js / BigInt structure
      return bigInt(val.low).add(bigInt(val.high).multiply(bigInt(2).pow(32)));
    }
    if (typeof val.toString === "function") {
      const str = val.toString();
      if (str && str !== "[object Object]") {
        try {
          return bigInt(str);
        } catch (_) {}
      }
    }
  }
  return bigInt(0);
}

/**
 * Safely reconstructs valid GramJS InputFileLocation instances with strict BigInt,
 * big-integer, and Buffer / Uint8Array types from serialized IndexedDB/Zustand file objects.
 */
export function rehydrateFileLocation(file: DriveFile): Api.TypeInputFileLocation {
  const loc = file.location as any;
  const rawId = loc?.id ?? (file as any).docId ?? file.messageId;
  const rawAccessHash = loc?.accessHash ?? file.accessHash;
  const rawFileRef = loc?.fileReference?.data ?? loc?.fileReference ?? file.fileReference;

  const id = toBigIntSafe(rawId);
  const accessHash = toBigIntSafe(rawAccessHash);

  // Reconstruct Buffer / Uint8Array from any serialized object shape (e.g. {0: 2, 1: 15...} or Array)
  let fileReference: Buffer;
  if (Buffer.isBuffer(rawFileRef)) {
    fileReference = rawFileRef;
  } else if (rawFileRef instanceof Uint8Array) {
    fileReference = Buffer.from(rawFileRef);
  } else if (Array.isArray(rawFileRef)) {
    fileReference = Buffer.from(rawFileRef);
  } else if (rawFileRef && typeof rawFileRef === "object") {
    fileReference = Buffer.from(Object.values(rawFileRef));
  } else {
    fileReference = Buffer.alloc(0);
  }

  if (
    file.category === "IMAGE" ||
    (file.mimeType?.startsWith("image/") && !file.name.endsWith(".webp") && loc?.thumbSize !== undefined)
  ) {
    return new Api.InputPhotoFileLocation({
      id: id as any,
      accessHash: accessHash as any,
      fileReference,
      thumbSize: loc?.thumbSize || "x",
    });
  }

  return new Api.InputDocumentFileLocation({
    id: id as any,
    accessHash: accessHash as any,
    fileReference,
    thumbSize: loc?.thumbSize || "",
  });
}
