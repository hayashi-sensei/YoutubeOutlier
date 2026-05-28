import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { assertSafeObjectKey } from "@/lib/storage/keys";
import type { R2StorageConfig } from "@/lib/storage/config";
import type { StorageAdapter, StorageGetObjectResult, StoragePutObjectInput } from "@/lib/storage/types";

type R2Command = PutObjectCommand | GetObjectCommand | DeleteObjectCommand;

type R2Client = {
  send(command: R2Command): Promise<unknown>;
};

type R2GetObjectOutput = {
  Body?: {
    transformToByteArray?: () => Promise<Uint8Array>;
  };
  ContentType?: string;
};

export function createR2Client(config: R2StorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function createR2StorageAdapter(input: {
  config: R2StorageConfig;
  client?: R2Client;
  createSignedReadUrl?: (input: {
    client: R2Client;
    bucketName: string;
    key: string;
    expiresInSeconds: number;
  }) => Promise<string>;
}): StorageAdapter {
  const client = input.client ?? createR2Client(input.config);

  return {
    async putObject(object: StoragePutObjectInput) {
      const key = assertSafeObjectKey(object.key);
      await client.send(new PutObjectCommand({
        Bucket: input.config.bucketName,
        Key: key,
        Body: object.body,
        ContentType: object.contentType,
        CacheControl: object.cacheControl,
      }));

      return {
        key,
        publicUrl: publicUrl(input.config.publicBaseUrl, key),
      };
    },

    async getObject(object: { key: string }): Promise<StorageGetObjectResult> {
      const key = assertSafeObjectKey(object.key);
      const response = await client.send(new GetObjectCommand({
        Bucket: input.config.bucketName,
        Key: key,
      }));
      const output = response as R2GetObjectOutput;
      const bytes = await output.Body?.transformToByteArray?.();
      if (!bytes) {
        throw new Error("Storage object body was empty.");
      }

      return {
        key,
        body: Buffer.from(bytes),
        contentType: output.ContentType ?? null,
      };
    },

    async deleteObject(object: { key: string }): Promise<void> {
      const key = assertSafeObjectKey(object.key);
      await client.send(new DeleteObjectCommand({
        Bucket: input.config.bucketName,
        Key: key,
      }));
    },

    async createSignedReadUrl(object: { key: string; expiresInSeconds: number }): Promise<string> {
      const key = assertSafeObjectKey(object.key);
      const signer = input.createSignedReadUrl ?? defaultSignedReadUrl;
      return signer({
        client,
        bucketName: input.config.bucketName,
        key,
        expiresInSeconds: object.expiresInSeconds,
      });
    },

    getPublicUrl(key: string): string | null {
      return publicUrl(input.config.publicBaseUrl, assertSafeObjectKey(key));
    },
  };
}

async function defaultSignedReadUrl(input: {
  client: R2Client;
  bucketName: string;
  key: string;
  expiresInSeconds: number;
}): Promise<string> {
  return getSignedUrl(
    input.client as S3Client,
    new GetObjectCommand({
      Bucket: input.bucketName,
      Key: input.key,
    }),
    { expiresIn: input.expiresInSeconds },
  );
}

function publicUrl(publicBaseUrl: string | null, key: string): string | null {
  if (!publicBaseUrl) {
    return null;
  }
  return `${publicBaseUrl.replace(/\/+$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
