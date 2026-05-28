import { describe, expect, test, vi } from "vitest";

import { saveVersionedContentAsset } from "../../lib/content-workspace/assets";

describe("content workspace assets", () => {
  test("saves the first asset version as version 1", async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => [{ id: "content-1" }]),
      contentAsset: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: "asset-1", version: 1 })),
      },
    };

    await expect(
      saveVersionedContentAsset(prisma, {
        contentItemId: "content-1",
        assetType: "outline",
        title: "Outline",
        jsonBody: { title: "Outline" },
        aiGenerationId: "gen-1",
      }),
    ).resolves.toEqual({ id: "asset-1", version: 1 });

    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(prisma.contentAsset.create).toHaveBeenCalledWith({
      data: {
        contentItemId: "content-1",
        assetType: "outline",
        title: "Outline",
        body: undefined,
        jsonBody: { title: "Outline" },
        aiGenerationId: "gen-1",
        version: 1,
      },
      select: { id: true, version: true },
    });
  });

  test("increments from the latest matching asset version", async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => [{ id: "content-1" }]),
      contentAsset: {
        findFirst: vi.fn(async () => ({ version: 3 })),
        create: vi.fn(async () => ({ id: "asset-4", version: 4 })),
      },
    };

    await saveVersionedContentAsset(prisma, {
      contentItemId: "content-1",
      assetType: "hook",
      title: "Hooks",
      jsonBody: { hooks: ["A", "B", "C", "D", "E"] },
    });

    expect(prisma.contentAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 4 }),
      }),
    );
  });

  test("serializes concurrent version allocation with a content item lock", async () => {
    const prisma = createSerializingAssetPrisma();

    const [first, second] = await Promise.all([
      saveVersionedContentAsset(prisma, {
        contentItemId: "content-1",
        assetType: "titles",
        title: "Titles",
        jsonBody: { titles: ["A"] },
      }),
      saveVersionedContentAsset(prisma, {
        contentItemId: "content-1",
        assetType: "titles",
        title: "Titles",
        jsonBody: { titles: ["B"] },
      }),
    ]);

    expect(first).toEqual({ id: "asset-1", version: 1 });
    expect(second).toEqual({ id: "asset-2", version: 2 });
    expect(prisma.contentAsset.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ version: 1 }) }),
    );
    expect(prisma.contentAsset.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ version: 2 }) }),
    );
  });
});

function createSerializingAssetPrisma() {
  const assets: Array<{ id: string; contentItemId: string; assetType: string; version: number }> = [];
  let lockQueue = Promise.resolve();
  let releaseCurrentLock: (() => void) | null = null;

  return {
    $queryRaw: vi.fn(async () => {
      let releaseThisLock: () => void = () => undefined;
      const thisLock = new Promise<void>((resolve) => {
        releaseThisLock = resolve;
      });
      const previousLock = lockQueue;
      lockQueue = thisLock;
      await previousLock;
      releaseCurrentLock = releaseThisLock;
      return [{ id: "content-1" }];
    }),
    contentAsset: {
      findFirst: vi.fn(async ({ where }: { where: { contentItemId: string; assetType: string } }) => {
        const latest = assets
          .filter((asset) => asset.contentItemId === where.contentItemId && asset.assetType === where.assetType)
          .sort((a, b) => b.version - a.version)[0];
        return latest ? { version: latest.version } : null;
      }),
      create: vi.fn(async ({ data }: { data: { contentItemId: string; assetType: string; version: number } }) => {
        const asset = {
          id: `asset-${assets.length + 1}`,
          contentItemId: data.contentItemId,
          assetType: data.assetType,
          version: data.version,
        };
        assets.push(asset);
        releaseCurrentLock?.();
        releaseCurrentLock = null;
        return { id: asset.id, version: asset.version };
      }),
    },
  };
}
