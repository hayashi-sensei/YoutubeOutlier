import { assertSafeObjectKey } from "@/lib/storage/keys";
import type { StorageAdapter, StorageGetObjectResult, StoragePutObjectInput } from "@/lib/storage/types";

type StoredObject = {
  body: Buffer;
  contentType: string | null;
};

export function createMemoryStorageAdapter(options: {
  publicBaseUrl?: string | null;
  signedUrlBase?: string;
} = {}): StorageAdapter {
  const objects = new Map<string, StoredObject>();
  const signedUrlBase = options.signedUrlBase ?? "https://storage.local/signed";

  return {
    async putObject(input: StoragePutObjectInput) {
      const key = assertSafeObjectKey(input.key);
      objects.set(key, {
        body: Buffer.from(input.body),
        contentType: input.contentType ?? null,
      });
      return { key, publicUrl: publicUrl(options.publicBaseUrl, key) };
    },

    async getObject(input: { key: string }): Promise<StorageGetObjectResult> {
      const key = assertSafeObjectKey(input.key);
      const stored = objects.get(key);
      if (!stored) {
        throw new Error("Storage object not found.");
      }
      return {
        key,
        body: Buffer.from(stored.body),
        contentType: stored.contentType,
      };
    },

    async deleteObject(input: { key: string }): Promise<void> {
      objects.delete(assertSafeObjectKey(input.key));
    },

    async createSignedReadUrl(input: { key: string; expiresInSeconds: number }): Promise<string> {
      const key = assertSafeObjectKey(input.key);
      const params = new URLSearchParams({
        key,
        expires: String(input.expiresInSeconds),
      });
      return `${signedUrlBase}?${params.toString()}`;
    },

    getPublicUrl(key: string): string | null {
      return publicUrl(options.publicBaseUrl, assertSafeObjectKey(key));
    },
  };
}

function publicUrl(publicBaseUrl: string | null | undefined, key: string): string | null {
  if (!publicBaseUrl) {
    return null;
  }
  return `${publicBaseUrl.replace(/\/+$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
