import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { mediaLibrary } from "@/storage/database/shared/schema";

export const MAX_MEDIA_FILE_SIZE = 5 * 1024 * 1024;

export const ALLOWED_MEDIA_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

interface StoredMediaObject {
  filename: string;
  url: string;
  provider: "s3" | "local";
}

interface MediaUploadInput {
  file: File;
  folder?: string;
  altText?: string | null;
  uploadedBy?: string | null;
}

function normalizeFolder(folder: string | undefined): string {
  const parts = (folder || "media")
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const safeParts = parts.filter((part) => /^[a-zA-Z0-9._-]+$/.test(part));
  return safeParts.length > 0 ? safeParts.join("/") : "media";
}

function encodeS3Key(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function getS3Bucket(): string | null {
  return process.env.AWS_S3_BUCKET?.trim() || null;
}

function getS3Region(): string | null {
  return process.env.AWS_REGION?.trim() || null;
}

function isS3Configured(): boolean {
  return Boolean(getS3Bucket() && getS3Region());
}

async function createS3Client(): Promise<any> {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const config: any = {
    region: getS3Region() || "us-east-1",
  };

  const endpoint = process.env.AWS_S3_ENDPOINT?.trim();
  if (endpoint) config.endpoint = endpoint;
  if (process.env.AWS_S3_FORCE_PATH_STYLE === "true") config.forcePathStyle = true;

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (accessKeyId && secretAccessKey) {
    config.credentials = { accessKeyId, secretAccessKey };
  }

  return new S3Client(config);
}

function getS3PublicUrl(key: string): string {
  const publicBase = process.env.AWS_S3_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (publicBase) return `${publicBase}/${encodeS3Key(key)}`;

  const bucket = getS3Bucket();
  const region = getS3Region();
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;
}

function getLocalUploadRoot(): string {
  return path.resolve(process.env.MEDIA_UPLOAD_DIR || path.join(process.cwd(), "public", "uploads"));
}

function getLocalPathForKey(key: string): string {
  const root = getLocalUploadRoot();
  const cleanKey = key.replace(/\\/g, "/").replace(/^\/+/, "");
  const target = path.resolve(root, ...cleanKey.split("/"));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new ValidationError("Invalid upload path");
  }
  return target;
}

function assertValidFile(file: File): string {
  if (!file) throw new ValidationError("No file provided");
  const ext = ALLOWED_MEDIA_TYPES[file.type];
  if (!ext) {
    throw new ValidationError("Invalid file type. Only jpg, png, webp, gif are allowed");
  }
  if (file.size > MAX_MEDIA_FILE_SIZE) {
    throw new ValidationError("File too large. Maximum size is 5MB");
  }
  return ext;
}

async function storeMediaObject(file: File, folder?: string): Promise<StoredMediaObject> {
  const ext = assertValidFile(file);
  const key = `${normalizeFolder(folder)}/${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  if (isS3Configured()) {
    const bucket = getS3Bucket();
    if (!bucket) throw new Error("AWS_S3_BUCKET is not configured");

    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3Client = await createS3Client();
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      ContentLength: file.size,
      CacheControl: "public, max-age=31536000, immutable",
    }));

    return {
      filename: key,
      url: getS3PublicUrl(key),
      provider: "s3",
    };
  }

  if (process.env.NODE_ENV === "production" && !process.env.MEDIA_UPLOAD_DIR) {
    throw new Error("Image storage is not configured. Set AWS_S3_BUCKET/AWS_REGION or MEDIA_UPLOAD_DIR.");
  }

  const filePath = getLocalPathForKey(key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);

  return {
    filename: key,
    url: `/uploads/${key}`,
    provider: "local",
  };
}

async function deleteStoredMediaObject(object: Pick<StoredMediaObject, "filename" | "url">): Promise<void> {
  if (object.url.startsWith("/uploads/")) {
    const key = object.url.slice("/uploads/".length) || object.filename;
    await unlink(getLocalPathForKey(key)).catch(() => undefined);
    return;
  }

  if (!isS3Configured()) return;
  const bucket = getS3Bucket();
  if (!bucket) return;

  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const s3Client = await createS3Client();
  await s3Client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: object.filename,
  }));
}

export async function createMediaUpload(input: MediaUploadInput) {
  const stored = await storeMediaObject(input.file, input.folder);
  const id = randomUUID();

  try {
    await db.insert(mediaLibrary).values({
      id,
      filename: stored.filename,
      original_name: input.file.name.slice(0, 255),
      mime_type: input.file.type,
      size: input.file.size,
      url: stored.url,
      alt_text: input.altText || null,
      uploaded_by: input.uploadedBy || null,
    });
  } catch (error) {
    await deleteStoredMediaObject(stored).catch(() => undefined);
    throw error;
  }

  return {
    id,
    filename: stored.filename,
    original_name: input.file.name.slice(0, 255),
    mime_type: input.file.type,
    size: input.file.size,
    url: stored.url,
    provider: stored.provider,
  };
}

export async function deleteMediaStorageObject(record: { filename: string; url: string }): Promise<void> {
  await deleteStoredMediaObject(record);
}
