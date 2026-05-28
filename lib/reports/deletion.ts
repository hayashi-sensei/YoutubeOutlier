export type ResearchReportDeletionPrisma = {
  $transaction<T>(callback: (tx: ResearchReportDeletionTx) => Promise<T>): Promise<T>;
};

type ResearchReportDeletionTx = {
  topicRecommendation: {
    updateMany(input: {
      where: {
        reportId:
          | string
          | {
              in: string[];
            };
        workspaceId: string;
      };
      data: { reportId: null };
    }): Promise<{ count: number }>;
  };
  exportFile: {
    updateMany(input: {
      where: {
        reportId:
          | string
          | {
              in: string[];
            };
        workspaceId: string;
      };
      data: { reportId: null };
    }): Promise<{ count: number }>;
  };
  researchReport: {
    findMany?(input: {
      where: {
        workspaceId: string;
        status: "FAILED";
      };
      select: { id: true };
    }): Promise<Array<{ id: string }>>;
    deleteMany(input: {
      where: {
        workspaceId: string;
        id:
          | string
          | {
              in: string[];
            };
      };
    }): Promise<{ count: number }>;
  };
};

export async function deleteWorkspaceResearchReport(
  prisma: ResearchReportDeletionPrisma,
  input: { workspaceId: string; reportId: string },
): Promise<{ deleted: boolean }> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.topicRecommendation.updateMany({
      where: {
        reportId: input.reportId,
        workspaceId: input.workspaceId,
      },
      data: { reportId: null },
    });
    await tx.exportFile.updateMany({
      where: {
        reportId: input.reportId,
        workspaceId: input.workspaceId,
      },
      data: { reportId: null },
    });

    return tx.researchReport.deleteMany({
      where: {
        id: input.reportId,
        workspaceId: input.workspaceId,
      },
    });
  });

  return { deleted: result.count > 0 };
}

export async function deleteFailedWorkspaceResearchReports(
  prisma: ResearchReportDeletionPrisma,
  input: { workspaceId: string },
): Promise<{ deletedCount: number }> {
  const result = await prisma.$transaction(async (tx) => {
    if (!tx.researchReport.findMany) {
      return { count: 0 };
    }

    const reports = await tx.researchReport.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: "FAILED",
      },
      select: { id: true },
    });
    const reportIds = reports.map((report) => report.id);

    if (reportIds.length === 0) {
      return { count: 0 };
    }

    await tx.topicRecommendation.updateMany({
      where: {
        workspaceId: input.workspaceId,
        reportId: { in: reportIds },
      },
      data: { reportId: null },
    });
    await tx.exportFile.updateMany({
      where: {
        workspaceId: input.workspaceId,
        reportId: { in: reportIds },
      },
      data: { reportId: null },
    });

    return tx.researchReport.deleteMany({
      where: {
        workspaceId: input.workspaceId,
        id: { in: reportIds },
      },
    });
  });

  return { deletedCount: result.count };
}
