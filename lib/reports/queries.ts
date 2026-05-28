export type ResearchReportSectionMap = Record<string, unknown>;

export type ResearchReportDetail = {
  id: string;
  workspaceId: string;
  title: string;
  status: string;
  reportDate: Date;
  manualRun: boolean;
  summary: string | null;
  sections: ResearchReportSectionMap;
  errorMessage: string | null;
  generatedAt: Date | null;
  createdAt: Date;
  recommendations: Array<{
    id: string;
    title: string;
    topic: string;
    angle: string | null;
    whyNow: string | null;
    opportunityScore: number | null;
    suggestedTitle: string | null;
    thumbnailConcept: string | null;
    evidences: Array<{
      id: string;
      evidenceType: string;
      note: string | null;
      video: {
        id: string;
        youtubeVideoId: string;
        title: string;
        thumbnailUrl: string | null;
        channel: { title: string; handle: string | null };
      } | null;
      sourceItem: {
        id: string;
        title: string;
        url: string;
        source: { name: string | null; url: string };
      } | null;
    }>;
  }>;
  exports: Array<{
    id: string;
    fileType: string;
    storagePath: string;
    downloadUrl: string | null;
    expiresAt: Date | null;
    createdAt: Date;
  }>;
};

export type ResearchReportDetailPrisma = {
  researchReport: {
    findFirst(input: unknown): Promise<unknown | null>;
  };
  youtubeVideo?: {
    findMany(input: {
      where: { id: { in: string[] } };
      select: { id: true; youtubeVideoId: true };
    }): Promise<Array<{ id: string; youtubeVideoId: string }>>;
  };
};

export async function getWorkspaceResearchReportDetail(
  prisma: ResearchReportDetailPrisma,
  input: { workspaceId: string; reportId: string },
): Promise<ResearchReportDetail | null> {
  const report = await prisma.researchReport.findFirst({
    where: {
      id: input.reportId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      status: true,
      reportDate: true,
      manualRun: true,
      summary: true,
      sectionsJson: true,
      errorMessage: true,
      generatedAt: true,
      createdAt: true,
      recommendations: {
        orderBy: [{ opportunityScore: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          topic: true,
          angle: true,
          whyNow: true,
          opportunityScore: true,
          suggestedTitle: true,
          thumbnailConcept: true,
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
                  thumbnailUrl: true,
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
      },
      exports: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fileType: true,
          storagePath: true,
          downloadUrl: true,
          expiresAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!report) {
    return null;
  }

  const normalized = normalizeReport(report);
  return hydrateLegacyVideoSectionLinks(prisma, normalized);
}

function normalizeReport(report: unknown): ResearchReportDetail {
  const row = report as Omit<ResearchReportDetail, "sections"> & {
    sectionsJson: unknown;
  };

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    status: row.status,
    reportDate: row.reportDate,
    manualRun: row.manualRun,
    summary: row.summary,
    sections: isObject(row.sectionsJson) ? row.sectionsJson : {},
    errorMessage: row.errorMessage,
    generatedAt: row.generatedAt,
    createdAt: row.createdAt,
    recommendations: row.recommendations,
    exports: row.exports,
  };
}

function isObject(value: unknown): value is ResearchReportSectionMap {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function hydrateLegacyVideoSectionLinks(
  prisma: ResearchReportDetailPrisma,
  report: ResearchReportDetail,
): Promise<ResearchReportDetail> {
  const videoIds = [
    ...sectionVideoIds(report.sections.competitorUploads),
    ...sectionVideoIds(report.sections.outliers),
  ];
  const uniqueVideoIds = [...new Set(videoIds)];

  if (uniqueVideoIds.length === 0 || !prisma.youtubeVideo) {
    return report;
  }

  const videos = await prisma.youtubeVideo.findMany({
    where: { id: { in: uniqueVideoIds } },
    select: { id: true, youtubeVideoId: true },
  });
  const publicIdByInternalId = new Map(videos.map((video) => [video.id, video.youtubeVideoId]));

  return {
    ...report,
    sections: {
      ...report.sections,
      competitorUploads: hydrateVideoSection(report.sections.competitorUploads, publicIdByInternalId),
      outliers: hydrateVideoSection(report.sections.outliers, publicIdByInternalId),
    },
  };
}

function sectionVideoIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .filter((item) => typeof item.youtubeUrl !== "string")
    .map((item) => item.youtubeVideoId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

function hydrateVideoSection(value: unknown, publicIdByInternalId: Map<string, string>): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => {
    if (!isObject(item) || typeof item.youtubeUrl === "string") {
      return item;
    }

    const internalVideoId = typeof item.youtubeVideoId === "string" ? item.youtubeVideoId : null;
    const publicYoutubeVideoId = internalVideoId ? publicIdByInternalId.get(internalVideoId) : null;

    if (!publicYoutubeVideoId) {
      return item;
    }

    return {
      ...item,
      publicYoutubeVideoId,
      youtubeUrl: youtubeWatchUrl(publicYoutubeVideoId),
    };
  });
}

function youtubeWatchUrl(youtubeVideoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeVideoId)}`;
}
