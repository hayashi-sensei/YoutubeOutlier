import type {
  BlueprintObservation,
  BlueprintSummaryRow,
} from "../../types/blueprints";

type BlueprintRecord = {
  id: string;
  workspaceId: string;
  youtubeChannelId: string;
  summary: string | null;
  titlePatterns: unknown;
  hookPatterns: unknown;
  thumbnailPatterns: unknown;
  contentPillars: unknown;
  structurePatterns: unknown;
  ctaPatterns: unknown;
  emotionalAngles: unknown;
  observationsJson: unknown;
  videoCount: number;
  averageOutlierScore: number | null;
  generatedAt: Date;
  updatedAt: Date;
  channel: { title: string; handle: string | null; thumbnailUrl: string | null };
};

export type BlueprintQueryPrisma = {
  competitorBlueprint: {
    findMany(input: unknown): Promise<unknown[]>;
  };
};

export async function getWorkspaceBlueprintSummaries(
  prisma: BlueprintQueryPrisma,
  input: { workspaceId: string; limit: number },
): Promise<BlueprintSummaryRow[]> {
  const rows = (await prisma.competitorBlueprint.findMany({
    where: { workspaceId: input.workspaceId },
    orderBy: [{ updatedAt: "desc" }],
    take: input.limit,
    select: {
      id: true,
      workspaceId: true,
      youtubeChannelId: true,
      summary: true,
      titlePatterns: true,
      hookPatterns: true,
      thumbnailPatterns: true,
      contentPillars: true,
      structurePatterns: true,
      ctaPatterns: true,
      emotionalAngles: true,
      observationsJson: true,
      videoCount: true,
      averageOutlierScore: true,
      generatedAt: true,
      updatedAt: true,
      channel: { select: { title: true, handle: true, thumbnailUrl: true } },
    },
  })) as BlueprintRecord[];

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    youtubeChannelId: row.youtubeChannelId,
    summary: row.summary,
    channelTitle: row.channel.title,
    channelHandle: row.channel.handle,
    channelThumbnailUrl: row.channel.thumbnailUrl,
    videoCount: row.videoCount,
    averageOutlierScore: row.averageOutlierScore ?? 0,
    titlePatterns: stringArray(row.titlePatterns),
    hookPatterns: stringArray(row.hookPatterns),
    thumbnailPatterns: stringArray(row.thumbnailPatterns),
    contentPillars: stringArray(row.contentPillars),
    structurePatterns: stringArray(row.structurePatterns),
    ctaPatterns: stringArray(row.ctaPatterns),
    emotionalAngles: stringArray(row.emotionalAngles),
    observations: observationArray(row.observationsJson),
    generatedAt: row.generatedAt,
    updatedAt: row.updatedAt,
  }));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function observationArray(value: unknown): BlueprintObservation[] {
  return Array.isArray(value)
    ? (value.filter((item) => item && typeof item === "object") as BlueprintObservation[])
    : [];
}
