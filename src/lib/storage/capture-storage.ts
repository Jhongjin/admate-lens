import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const CAPTURE_IMAGES_BUCKET = "capture-images";

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];
export type CaptureImageKind = "placement" | "landing";

type StorageBucket = ReturnType<SupabaseClient["storage"]["from"]>;
type StorageUploadBody = Parameters<StorageBucket["upload"]>[1];
type StorageClient = Pick<SupabaseClient, "storage">;

const IMAGE_EXTENSION_BY_MIME_TYPE: Record<AllowedImageMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function isAllowedImageMimeType(mimeType: string): mimeType is AllowedImageMimeType {
  return ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as AllowedImageMimeType);
}

export function extensionForImageMimeType(mimeType: AllowedImageMimeType): string {
  return IMAGE_EXTENSION_BY_MIME_TYPE[mimeType];
}

export function makeCreativeStoragePath(mimeType: AllowedImageMimeType): string {
  const extension = extensionForImageMimeType(mimeType);
  return `creatives/creative_${Date.now()}_${randomUUID()}.${extension}`;
}

export function makeCaptureStoragePath(
  captureId: string,
  kind: CaptureImageKind,
  timestamp = Date.now()
): string {
  return `captures/${captureId}/${kind}_${timestamp}.png`;
}

export function getStorageFilename(storagePath: string): string {
  return storagePath.split("/").pop() ?? storagePath;
}

export async function uploadStorageObject(
  supabase: StorageClient,
  storagePath: string,
  body: StorageUploadBody,
  options: {
    contentType: string;
    label: string;
    upsert?: boolean;
    cacheControl?: string;
  }
): Promise<{ path: string; publicUrl: string }> {
  const { error } = await supabase.storage
    .from(CAPTURE_IMAGES_BUCKET)
    .upload(storagePath, body, {
      contentType: options.contentType,
      cacheControl: options.cacheControl ?? "31536000",
      upsert: options.upsert ?? true,
    });

  if (error) {
    throw new Error(`${options.label} 업로드 실패: ${error.message}`);
  }

  const { data } = supabase.storage.from(CAPTURE_IMAGES_BUCKET).getPublicUrl(storagePath);

  return {
    path: storagePath,
    publicUrl: data.publicUrl,
  };
}

export async function removeCaptureStorageFolder(
  supabase: StorageClient,
  captureId: string
): Promise<number> {
  const folderPath = `captures/${captureId}`;
  const { data: files, error: listError } = await supabase.storage
    .from(CAPTURE_IMAGES_BUCKET)
    .list(folderPath);

  if (listError) {
    throw new Error(`Storage 파일 목록 조회 실패: ${listError.message}`);
  }

  if (!files?.length) {
    return 0;
  }

  const paths = files.map((file) => `${folderPath}/${file.name}`);
  const { error: removeError } = await supabase.storage.from(CAPTURE_IMAGES_BUCKET).remove(paths);

  if (removeError) {
    throw new Error(`Storage 파일 삭제 실패: ${removeError.message}`);
  }

  return paths.length;
}
