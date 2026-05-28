import { describe, expect, test, vi } from "vitest";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { createR2StorageAdapter } from "../../lib/storage/r2-adapter";

describe("R2 storage adapter", () => {
  test("uploads, reads, deletes, signs, and exposes public URLs with safe keys", async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof GetObjectCommand) {
        return {
          Body: {
            transformToByteArray: async () => Uint8Array.from(Buffer.from("stored-body")),
          },
          ContentType: "text/plain",
        };
      }
      return {};
    });
    const createSignedReadUrl = vi.fn(async () => "https://signed.example.com/object");
    const storage = createR2StorageAdapter({
      config: {
        accountId: "account-id",
        endpoint: "https://account-id.r2.cloudflarestorage.com",
        bucketName: "bucket",
        region: "auto",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        publicBaseUrl: "https://assets.example.com",
      },
      client: { send },
      createSignedReadUrl,
    });

    await expect(
      storage.putObject({
        key: "exports/workspace-1/report-1/export-1.pdf",
        contentType: "application/pdf",
        body: Buffer.from("pdf-body"),
      }),
    ).resolves.toEqual({
      key: "exports/workspace-1/report-1/export-1.pdf",
      publicUrl: "https://assets.example.com/exports/workspace-1/report-1/export-1.pdf",
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);

    await expect(storage.getObject({ key: "exports/workspace-1/report-1/export-1.pdf" })).resolves.toEqual({
      key: "exports/workspace-1/report-1/export-1.pdf",
      contentType: "text/plain",
      body: Buffer.from("stored-body"),
    });
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(GetObjectCommand);

    await expect(
      storage.createSignedReadUrl({
        key: "exports/workspace-1/report-1/export-1.pdf",
        expiresInSeconds: 300,
      }),
    ).resolves.toBe("https://signed.example.com/object");
    expect(createSignedReadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "exports/workspace-1/report-1/export-1.pdf",
        expiresInSeconds: 300,
      }),
    );

    await storage.deleteObject({ key: "exports/workspace-1/report-1/export-1.pdf" });
    expect(send.mock.calls[2]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });
});
