import { describe, expect, test } from "vitest";

import { createMemoryStorageAdapter } from "../../lib/storage/memory-adapter";

describe("memory storage adapter", () => {
  test("uploads, reads, signs, exposes configured public URLs, and deletes objects", async () => {
    const storage = createMemoryStorageAdapter({
      publicBaseUrl: "https://assets.example.com/base/",
      signedUrlBase: "https://signed.example.com/download",
    });

    await storage.putObject({
      key: "exports/workspace-1/report-1/export-1.pdf",
      contentType: "application/pdf",
      body: Buffer.from("pdf-body"),
    });

    await expect(storage.getObject({ key: "exports/workspace-1/report-1/export-1.pdf" })).resolves.toEqual({
      key: "exports/workspace-1/report-1/export-1.pdf",
      contentType: "application/pdf",
      body: Buffer.from("pdf-body"),
    });
    expect(storage.getPublicUrl("exports/workspace-1/report-1/export-1.pdf")).toBe(
      "https://assets.example.com/base/exports/workspace-1/report-1/export-1.pdf",
    );
    expect(
      await storage.createSignedReadUrl({
        key: "exports/workspace-1/report-1/export-1.pdf",
        expiresInSeconds: 60,
      }),
    ).toBe("https://signed.example.com/download?key=exports%2Fworkspace-1%2Freport-1%2Fexport-1.pdf&expires=60");

    await storage.deleteObject({ key: "exports/workspace-1/report-1/export-1.pdf" });

    await expect(storage.getObject({ key: "exports/workspace-1/report-1/export-1.pdf" })).rejects.toThrow(
      "Storage object not found",
    );
  });
});
