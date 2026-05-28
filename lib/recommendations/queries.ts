import type { TopicRecommendationSummaryRow } from "../../types/recommendations";

type RecommendationRecord = TopicRecommendationSummaryRow;

export type RecommendationQueryPrisma = {
  topicRecommendation: {
    findMany(input: unknown): Promise<unknown[]>;
    count(input: unknown): Promise<number>;
  };
  researchReport: {
    findMany(input: unknown): Promise<unknown[]>;
  };
};

export type ResearchReportSummaryRow = {
  id: string;
  title: string;
  status: string;
  reportDate: Date;
  manualRun: boolean;
  summary: string | null;
  errorMessage: string | null;
  generatedAt: Date | null;
  createdAt: Date;
  _count: { recommendations: number };
};

export async function getWorkspaceTopicRecommendations(
  prisma: RecommendationQueryPrisma,
  input: {
    workspaceId: string;
    limit: number;
    includeDismissed?: boolean;
    includeExpired?: boolean;
    includeUsed?: boolean;
    offset?: number;
    reportId?: string;
    kind?: "STANDARD" | "EXPERIMENTAL";
    sourceTrackedChannelId?: string | null;
  },
): Promise<TopicRecommendationSummaryRow[]> {
  return (await prisma.topicRecommendation.findMany({
    where: topicRecommendationWhere(input),
    orderBy: input.reportId
      ? [{ createdAt: "desc" }]
      : [{ opportunityScore: "desc" }, { createdAt: "desc" }],
    skip: input.offset ?? 0,
    take: input.limit,
    select: {
      id: true,
      title: true,
      topic: true,
      angle: true,
      whyNow: true,
      audiencePainPoint: true,
      opportunityScore: true,
      suggestedTitle: true,
      suggestedHook: true,
      thumbnailConcept: true,
      outlineJson: true,
      linkedinAngle: true,
      status: true,
      kind: true,
      sourceTrackedChannelId: true,
      createdAt: true,
      reportId: true,
      evidences: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          evidenceType: true,
          note: true,
          video: {
            select: {
              id: true,
              youtubeVideoId: true,
              title: true,
              channel: { select: { title: true, handle: true } },
            },
          },
          sourceItem: {
            select: {
              id: true,
              title: true,
              url: true,
              source: { select: { name: true, url: true } },
            },
          },
        },
      },
    },
  })) as RecommendationRecord[];
}

export async function countWorkspaceTopicRecommendations(
  prisma: RecommendationQueryPrisma,
  input: {
    workspaceId: string;
    includeDismissed?: boolean;
    includeExpired?: boolean;
    includeUsed?: boolean;
    reportId?: string;
    kind?: "STANDARD" | "EXPERIMENTAL";
    sourceTrackedChannelId?: string | null;
  },
): Promise<number> {
  return prisma.topicRecommendation.count({
    where: topicRecommendationWhere(input),
  });
}

function topicRecommendationWhere(input: {
  workspaceId: string;
  includeDismissed?: boolean;
  includeExpired?: boolean;
  includeUsed?: boolean;
  reportId?: string;
  kind?: "STANDARD" | "EXPERIMENTAL";
  sourceTrackedChannelId?: string | null;
}) {
  const hiddenStatuses: Array<"DISMISSED" | "EXPIRED" | "USED"> = [];
  if (!input.includeDismissed) {
    hiddenStatuses.push("DISMISSED");
  }
  if (!input.includeExpired) {
    hiddenStatuses.push("EXPIRED");
  }
  if (!input.includeUsed) {
    hiddenStatuses.push("USED");
  }

  return {
    workspaceId: input.workspaceId,
    ...(input.reportId ? { reportId: input.reportId } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
    sourceTrackedChannelId: input.sourceTrackedChannelId ?? null,
    ...(hiddenStatuses.length > 0
      ? {
          status: {
            notIn: hiddenStatuses,
          },
        }
      : {}),
  };
}

export async function getWorkspaceResearchReports(
  prisma: RecommendationQueryPrisma,
  input: { workspaceId: string; limit: number },
): Promise<ResearchReportSummaryRow[]> {
  return (await prisma.researchReport.findMany({
    where: { workspaceId: input.workspaceId },
    orderBy: [{ createdAt: "desc" }],
    take: input.limit,
    select: {
      id: true,
      title: true,
      status: true,
      reportDate: true,
      manualRun: true,
      summary: true,
      errorMessage: true,
      generatedAt: true,
      createdAt: true,
      _count: { select: { recommendations: true } },
    },
  })) as ResearchReportSummaryRow[];
}
