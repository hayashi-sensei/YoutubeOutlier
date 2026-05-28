import { describe, expect, test } from "vitest";

import { getR2StorageConfig } from "../../lib/storage/config";

describe("R2 storage config", () => {
  test("requires a complete Cloudflare R2 environment contract", () => {
    expect(() => getR2StorageConfig({})).toThrow("Cloudflare R2 storage is not fully configured");
    expect(() =>
      getR2StorageConfig({
        CLOUDFLARE_R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
        CLOUDFLARE_R2_BUCKET_NAME: "ytresearch",
      }),
    ).toThrow("Cloudflare R2 storage is not fully configured");
  });

  test("uses auto region and preserves optional public base URL", () => {
    expect(
      getR2StorageConfig({
        CLOUDFLARE_R2_ACCOUNT_ID: "account-id",
        CLOUDFLARE_R2_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
        CLOUDFLARE_R2_BUCKET_NAME: "ytresearch",
        CLOUDFLARE_R2_REGION: undefined,
        CLOUDFLARE_R2_ACCESS_KEY_ID: "access-key",
        CLOUDFLARE_R2_SECRET_ACCESS_KEY: "secret-key",
        CLOUDFLARE_R2_PUBLIC_BASE_URL: "https://assets.example.com/",
      }),
    ).toEqual({
      accountId: "account-id",
      endpoint: "https://account-id.r2.cloudflarestorage.com",
      bucketName: "ytresearch",
      region: "auto",
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      publicBaseUrl: "https://assets.example.com/",
    });
  });
});
