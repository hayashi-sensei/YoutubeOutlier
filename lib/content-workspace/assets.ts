export type ContentAssetWriterPrisma = {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  contentAsset: {
    findFirst(input: {
      where: { contentItemId: string; assetType: string };
      orderBy: { version: "desc" };
      select: { version: true };
    }): Promise<{ version: number } | null>;
    create(input: {
      data: {
        contentItemId: string;
        assetType: string;
        title?: string;
        body?: string;
        jsonBody?: unknown;
        aiGenerationId?: string;
        version: number;
      };
      select: { id: true; version: true };
    }): Promise<{ id: string; version: number }>;
  };
};

export async function saveVersionedContentAsset(
  prisma: ContentAssetWriterPrisma,
  input: {
    contentItemId: string;
    assetType: string;
    title?: string;
    body?: string;
    jsonBody?: unknown;
    aiGenerationId?: string;
  },
): Promise<{ id: string; version: number }> {
  await lockContentItemForVersionAllocation(prisma, input.contentItemId);
  return saveContentAssetOnce(prisma, input);
}

async function saveContentAssetOnce(
  prisma: ContentAssetWriterPrisma,
  input: {
    contentItemId: string;
    assetType: string;
    title?: string;
    body?: string;
    jsonBody?: unknown;
    aiGenerationId?: string;
  },
): Promise<{ id: string; version: number }> {
  const latest = await prisma.contentAsset.findFirst({
    where: { contentItemId: input.contentItemId, assetType: input.assetType },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  return prisma.contentAsset.create({
    data: {
      contentItemId: input.contentItemId,
      assetType: input.assetType,
      title: input.title,
      body: input.body,
      jsonBody: input.jsonBody,
      aiGenerationId: input.aiGenerationId,
      version: (latest?.version ?? 0) + 1,
    },
    select: { id: true, version: true },
  });
}

async function lockContentItemForVersionAllocation(
  prisma: ContentAssetWriterPrisma,
  contentItemId: string,
) {
  await prisma.$queryRaw`
    SELECT id FROM "ContentItem" WHERE id = ${contentItemId} FOR UPDATE
  `;
}
