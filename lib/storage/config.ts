import { env } from "@/lib/env";

export type R2StorageEnv = {
  CLOUDFLARE_R2_ACCOUNT_ID?: string;
  CLOUDFLARE_R2_ENDPOINT?: string;
  CLOUDFLARE_R2_BUCKET_NAME?: string;
  CLOUDFLARE_R2_REGION?: string;
  CLOUDFLARE_R2_ACCESS_KEY_ID?: string;
  CLOUDFLARE_R2_SECRET_ACCESS_KEY?: string;
  CLOUDFLARE_R2_PUBLIC_BASE_URL?: string;
};

export type R2StorageConfig = {
  accountId: string;
  endpoint: string;
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string | null;
};

export function getR2StorageConfig(source: R2StorageEnv = env): R2StorageConfig {
  const config = {
    accountId: clean(source.CLOUDFLARE_R2_ACCOUNT_ID),
    endpoint: clean(source.CLOUDFLARE_R2_ENDPOINT),
    bucketName: clean(source.CLOUDFLARE_R2_BUCKET_NAME),
    region: clean(source.CLOUDFLARE_R2_REGION) ?? "auto",
    accessKeyId: clean(source.CLOUDFLARE_R2_ACCESS_KEY_ID),
    secretAccessKey: clean(source.CLOUDFLARE_R2_SECRET_ACCESS_KEY),
    publicBaseUrl: clean(source.CLOUDFLARE_R2_PUBLIC_BASE_URL),
  };

  if (!config.accountId || !config.endpoint || !config.bucketName || !config.accessKeyId || !config.secretAccessKey) {
    throw new Error("Cloudflare R2 storage is not fully configured.");
  }

  return {
    accountId: config.accountId,
    endpoint: config.endpoint,
    bucketName: config.bucketName,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    publicBaseUrl: config.publicBaseUrl,
  };
}

function clean(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
