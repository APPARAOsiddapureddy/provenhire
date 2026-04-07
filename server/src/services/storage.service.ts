import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

function publicBaseUrl(): string {
  const raw = process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "";
  return raw.replace(/\/$/, "");
}

/** True when Cloudflare R2 (S3-compatible) env is complete — uploads go to object storage instead of local disk. */
export function isObjectStorageConfigured(): boolean {
  return !!(
    process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
    process.env.CLOUDFLARE_R2_BUCKET_NAME &&
    process.env.CLOUDFLARE_R2_PUBLIC_URL
  );
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID!;
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return s3Client;
}

/**
 * Upload bytes to R2; returns **public** URL (bucket must allow public read on that prefix, or use a custom domain).
 */
export async function uploadObject(buffer: Buffer, key: string, contentType: string): Promise<string> {
  if (!isObjectStorageConfigured()) {
    throw new Error("Object storage is not configured (set CLOUDFLARE_R2_* env vars)");
  }
  await new Upload({
    client: getS3Client(),
    params: {
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    },
  }).done();
  const path = key
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `${publicBaseUrl()}/${path}`;
}

export async function deleteObject(key: string): Promise<void> {
  if (!isObjectStorageConfigured()) return;
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
      Key: key,
    })
  );
}
