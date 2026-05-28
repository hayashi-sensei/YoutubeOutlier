import {
  HttpSourceFetchProvider,
  ingestIndustrySource,
  type IndustrySourceForIngestion,
  type IndustrySourceIngestionSummary,
  type IndustrySourceIngestionTx,
  type SourceFetchProvider,
} from "./ingestion";

const SOURCE_REFRESH_JOB_TYPE = "industry_source_refresh";

type IndustrySourceRead = {
  findUnique(input: {
    where: { id: string };
    select: {
      id: true;
      workspaceId: true;
      url: true;
      rssUrl: true;
    };
  }): Promise<(IndustrySourceForIngestion & { workspaceId: string }) | null>;
};

type SourceJobRunWrite = {
  create(input: {
    data: {
      workspaceId: string;
      jobType: typeof SOURCE_REFRESH_JOB_TYPE;
      status: "RUNNING";
      provider: "source";
      referenceType: "IndustrySource";
      referenceId: string;
      attempts: 1;
      maxAttempts: 3;
      startedAt: Date;
      metadata: { sourceUrl: string };
    };
  }): Promise<{ id: string }>;
  update(input: {
    where: { id: string };
    data:
      | {
          status: "SUCCEEDED";
          completedAt: Date;
          metadata: {
            sourceUrl: string;
            summary: IndustrySourceIngestionSummary;
          };
        }
      | {
          status: "FAILED";
          completedAt: Date;
          errorMessage: string;
        };
  }): Promise<unknown>;
};

export type SourceRunnerPrisma = IndustrySourceIngestionTx & {
  industrySource: IndustrySourceIngestionTx["industrySource"] & IndustrySourceRead;
  jobRun: SourceJobRunWrite;
};

export async function runIndustrySourceRefreshJob(input: {
  prisma: SourceRunnerPrisma;
  provider?: SourceFetchProvider;
  sourceId: string;
  jobRunId?: string;
  now?: Date;
}): Promise<IndustrySourceIngestionSummary> {
  const now = input.now ?? new Date();
  const source = await loadRunnerSource(input.prisma, input.sourceId);
  const metadata = { sourceUrl: source.url };
  const job = input.jobRunId
    ? { id: input.jobRunId }
    : await input.prisma.jobRun.create({
        data: {
          workspaceId: source.workspaceId,
          jobType: SOURCE_REFRESH_JOB_TYPE,
          status: "RUNNING",
          provider: "source",
          referenceType: "IndustrySource",
          referenceId: source.id,
          attempts: 1,
          maxAttempts: 3,
          startedAt: now,
          metadata,
        },
      });

  try {
    const summary = await ingestIndustrySource({
      tx: input.prisma,
      provider: input.provider ?? new HttpSourceFetchProvider(),
      source,
      mode: "refresh",
      now,
    });

    await input.prisma.jobRun.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        completedAt: now,
        metadata: {
          ...metadata,
          summary,
        },
      },
    });

    return summary;
  } catch (error) {
    await input.prisma.jobRun.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        completedAt: now,
        errorMessage: getErrorMessage(error),
      },
    });
    throw error;
  }
}

async function loadRunnerSource(
  prisma: SourceRunnerPrisma,
  sourceId: string,
): Promise<IndustrySourceForIngestion & { workspaceId: string }> {
  const source = await prisma.industrySource.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      workspaceId: true,
      url: true,
      rssUrl: true,
    },
  });

  if (!source) {
    throw new Error(`Industry source not found: ${sourceId}`);
  }

  return source;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
