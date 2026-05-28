import { env } from "@/lib/env";

const DEFAULT_DAILY_AI_SPEND_ALERT_USD = 25;
const DEFAULT_YOUTUBE_QUOTA_PRESSURE_RATIO = 0.9;
const DEFAULT_ABUSE_GENERATION_THRESHOLD = 25;
const DEFAULT_ABUSE_COST_THRESHOLD_USD = 10;

const NONCRITICAL_JOB_TYPES = new Set([
  "competitor_blueprint_analyze",
  "topic_recommendation_generate",
  "daily_report_generate",
  "outlier_score_refresh",
]);

type AiCostRow = {
  userId: string | null;
  taskType: string;
  costUsd: string | number | null;
  creditsCharged: number;
};

type AiGenerationRead = {
  aiGeneration: {
    findMany(input: {
      where: {
        createdAt: { gte: Date; lt: Date };
        status?: "SUCCEEDED";
      };
      select: {
        userId: true;
        taskType: true;
        provider?: true;
        model?: true;
        status?: true;
        costUsd: true;
        creditsCharged: true;
        createdAt?: true;
      };
    }): Promise<Array<AiCostRow & {
      provider?: string;
      model?: string;
      status?: string;
      createdAt?: Date;
    }>>;
  };
};

type YoutubeQuotaUsageRead = {
  youtubeQuotaUsage?: {
    aggregate(input: {
      _sum: { units: true };
      where: { quotaDate: { gte: Date; lt: Date } };
    }): Promise<{ _sum: { units: number | null } }>;
  };
};

type AlertWrite = {
  adminAuditLog?: {
    findFirst(input: {
      where: {
        action: string;
        targetType: string;
        targetId: string;
      };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(input: {
      data: {
        actorUserId: null;
        action: string;
        targetType: string;
        targetId: string;
        reason: string;
        metadata: unknown;
      };
    }): Promise<unknown>;
  };
};

export type CostControlsPrisma = AiGenerationRead & YoutubeQuotaUsageRead & AlertWrite;

export type UserTaskCostSummary = {
  userId: string | null;
  taskType: string;
  generations: number;
  creditsCharged: number;
  costUsd: number;
};

export type QuotaPressureSkip =
  | {
      skip: false;
    }
  | {
      skip: true;
      reason: "daily_ai_spend_threshold_reached";
      jobType: string;
      totalCostUsd: number;
      thresholdUsd: number;
    }
  | {
      skip: true;
      reason: "youtube_quota_pressure";
      jobType: string;
      usedUnits: number;
      dailyLimit: number;
      pressureRatio: number;
      thresholdRatio: number;
    };

export function summarizeAiCostByUserAndTask(rows: AiCostRow[]): UserTaskCostSummary[] {
  const grouped = new Map<string, UserTaskCostSummary>();

  for (const row of rows) {
    const key = `${row.userId ?? "system"}:${row.taskType}`;
    const current = grouped.get(key) ?? {
      userId: row.userId,
      taskType: row.taskType,
      generations: 0,
      creditsCharged: 0,
      costUsd: 0,
    };

    current.generations += 1;
    current.creditsCharged += row.creditsCharged;
    current.costUsd = roundCurrency(current.costUsd + Number(row.costUsd ?? 0));
    grouped.set(key, current);
  }

  return [...grouped.values()].sort((a, b) => b.costUsd - a.costUsd);
}

export async function runProviderCostSnapshot(
  prisma: CostControlsPrisma,
  input: {
    now?: Date;
    dailyAiSpendAlertUsd?: number;
    dailyYoutubeQuotaLimit?: number;
    youtubeQuotaPressureRatio?: number;
    abuseGenerationThreshold?: number;
    abuseCostThresholdUsd?: number;
  } = {},
) {
  const now = input.now ?? new Date();
  const thresholdUsd = input.dailyAiSpendAlertUsd ?? dailyAiSpendAlertUsd();
  const youtubeDailyLimit = input.dailyYoutubeQuotaLimit ?? env.YOUTUBE_DAILY_QUOTA_LIMIT;
  const youtubePressureRatio = input.youtubeQuotaPressureRatio ?? DEFAULT_YOUTUBE_QUOTA_PRESSURE_RATIO;
  const { start, end } = utcDayRange(now);
  const targetId = dayTargetId(now);
  const aiRows = await findDailyAiCostRows(prisma, { start, end });
  const totalCostUsd = roundCurrency(aiRows.reduce((sum, row) => sum + Number(row.costUsd ?? 0), 0));
  const userTaskCosts = summarizeAiCostByUserAndTask(aiRows);
  const abusePressures = userTaskCosts.filter(
    (row) =>
      row.userId !== null &&
      (row.generations >= (input.abuseGenerationThreshold ?? DEFAULT_ABUSE_GENERATION_THRESHOLD) ||
        row.costUsd >= (input.abuseCostThresholdUsd ?? DEFAULT_ABUSE_COST_THRESHOLD_USD)),
  );
  const youtubeQuota = await loadYoutubeQuotaPressure(prisma, {
    now,
    dailyLimit: youtubeDailyLimit,
    pressureRatio: youtubePressureRatio,
  });
  const alertsCreated: string[] = [];

  if (totalCostUsd >= thresholdUsd) {
    const action = "cost_control.provider_spend_alert";
    const created = await createAdminAlert(prisma, {
      action,
      targetType: "AiGeneration",
      targetId,
      reason: `Daily AI provider spend reached $${totalCostUsd.toFixed(2)}.`,
      metadata: {
        totalCostUsd,
        thresholdUsd,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        userTaskCosts,
      },
    });
    if (created) {
      alertsCreated.push(action);
    }
  }

  if (youtubeQuota.pressureRatio >= youtubePressureRatio) {
    const action = "cost_control.youtube_quota_pressure";
    const created = await createAdminAlert(prisma, {
      action,
      targetType: "YoutubeQuotaUsage",
      targetId,
      reason: `YouTube quota usage reached ${youtubeQuota.usedUnits}/${youtubeQuota.dailyLimit} units.`,
      metadata: youtubeQuota,
    });
    if (created) {
      alertsCreated.push(action);
    }
  }

  for (const pressure of abusePressures) {
    const action = "cost_control.abuse_pressure";
    const created = await createAdminAlert(prisma, {
      action,
      targetType: "AiGeneration",
      targetId: `${targetId}:${pressure.userId}:${pressure.taskType}`,
      reason: `Possible abuse pressure from ${pressure.userId} on ${pressure.taskType}.`,
      metadata: {
        ...pressure,
        generationThreshold: input.abuseGenerationThreshold ?? DEFAULT_ABUSE_GENERATION_THRESHOLD,
        costThresholdUsd: input.abuseCostThresholdUsd ?? DEFAULT_ABUSE_COST_THRESHOLD_USD,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
      },
    });
    if (created) {
      alertsCreated.push(action);
    }
  }

  return {
    aiSpend: {
      totalCostUsd,
      thresholdUsd,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
    },
    youtubeQuota,
    userTaskCosts,
    alertsCreated,
  };
}

export async function shouldSkipJobForQuotaPressure(
  prisma: AiGenerationRead & YoutubeQuotaUsageRead,
  input: {
    jobType: string;
    now?: Date;
    dailyAiSpendAlertUsd?: number;
    dailyYoutubeQuotaLimit?: number;
    youtubeQuotaPressureRatio?: number;
  },
): Promise<QuotaPressureSkip> {
  if (!NONCRITICAL_JOB_TYPES.has(input.jobType)) {
    return { skip: false };
  }

  const now = input.now ?? new Date();
  const { start, end } = utcDayRange(now);
  const thresholdUsd = input.dailyAiSpendAlertUsd ?? dailyAiSpendAlertUsd();
  const youtubeQuota = await loadYoutubeQuotaPressure(prisma, {
    now,
    dailyLimit: input.dailyYoutubeQuotaLimit ?? env.YOUTUBE_DAILY_QUOTA_LIMIT,
    pressureRatio: input.youtubeQuotaPressureRatio ?? DEFAULT_YOUTUBE_QUOTA_PRESSURE_RATIO,
  });
  if (youtubeQuota.pressureRatio >= youtubeQuota.thresholdRatio) {
    return {
      skip: true,
      reason: "youtube_quota_pressure",
      jobType: input.jobType,
      usedUnits: youtubeQuota.usedUnits,
      dailyLimit: youtubeQuota.dailyLimit,
      pressureRatio: youtubeQuota.pressureRatio,
      thresholdRatio: youtubeQuota.thresholdRatio,
    };
  }

  const aiRows = await findDailyAiCostRows(prisma, { start, end });
  const totalCostUsd = roundCurrency(aiRows.reduce((sum, row) => sum + Number(row.costUsd ?? 0), 0));

  if (totalCostUsd < thresholdUsd) {
    return { skip: false };
  }

  return {
    skip: true,
    reason: "daily_ai_spend_threshold_reached",
    jobType: input.jobType,
    totalCostUsd,
    thresholdUsd,
  };
}

async function findDailyAiCostRows(
  prisma: AiGenerationRead,
  input: { start: Date; end: Date },
) {
  return prisma.aiGeneration.findMany({
    where: {
      status: "SUCCEEDED",
      createdAt: {
        gte: input.start,
        lt: input.end,
      },
    },
    select: {
      userId: true,
      taskType: true,
      provider: true,
      model: true,
      status: true,
      costUsd: true,
      creditsCharged: true,
      createdAt: true,
    },
  });
}

async function loadYoutubeQuotaPressure(
  prisma: YoutubeQuotaUsageRead,
  input: { now: Date; dailyLimit: number; pressureRatio: number },
) {
  if (!prisma.youtubeQuotaUsage) {
    return {
      usedUnits: 0,
      dailyLimit: input.dailyLimit,
      pressureRatio: 0,
      thresholdRatio: input.pressureRatio,
    };
  }

  const { start, end } = pacificProviderDayRange(input.now);
  const usage = await prisma.youtubeQuotaUsage.aggregate({
    _sum: { units: true },
    where: {
      quotaDate: {
        gte: start,
        lt: end,
      },
    },
  });
  const usedUnits = usage._sum.units ?? 0;

  return {
    usedUnits,
    dailyLimit: input.dailyLimit,
    pressureRatio: input.dailyLimit > 0 ? roundRatio(usedUnits / input.dailyLimit) : 0,
    thresholdRatio: input.pressureRatio,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
  };
}

async function createAdminAlert(
  prisma: AlertWrite,
  input: {
    action: string;
    targetType: string;
    targetId: string;
    reason: string;
    metadata: unknown;
  },
): Promise<boolean> {
  if (!prisma.adminAuditLog) {
    return false;
  }

  const existing = await prisma.adminAuditLog.findFirst({
    where: {
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
    },
    select: { id: true },
  });

  if (existing) {
    return false;
  }

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      metadata: input.metadata,
    },
  });

  return true;
}

function dailyAiSpendAlertUsd(): number {
  return env.YTRESEARCH_DAILY_AI_SPEND_ALERT_USD || DEFAULT_DAILY_AI_SPEND_ALERT_USD;
}

function utcDayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function dayTargetId(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function pacificProviderDayRange(date: Date): { start: Date; end: Date } {
  const parts = timeZoneDateParts(date, "America/Los_Angeles");
  const start = zonedDateTimeToUtc(parts.year, parts.month, parts.day, "America/Los_Angeles");
  const end = zonedDateTimeToUtc(parts.year, parts.month, parts.day + 1, "America/Los_Angeles");
  return { start, end };
}

function zonedDateTimeToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day));
  const offset = timeZoneOffsetMs(utcGuess, timeZone);
  const candidate = new Date(utcGuess.getTime() - offset);
  const candidateOffset = timeZoneOffsetMs(candidate, timeZone);

  return candidateOffset === offset ? candidate : new Date(utcGuess.getTime() - candidateOffset);
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = timeZoneDateTimeParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  return asUtc - date.getTime();
}

function timeZoneDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = timeZoneDateTimeParts(date, timeZone);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

function timeZoneDateTimeParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const entries = formatter.formatToParts(date).flatMap((part) => {
    if (part.type === "literal") {
      return [];
    }

    return [[part.type, Number(part.value)] as const];
  });
  const parts = Object.fromEntries(entries);

  return {
    year: getDatePart(parts, "year"),
    month: getDatePart(parts, "month"),
    day: getDatePart(parts, "day"),
    hour: getDatePart(parts, "hour"),
    minute: getDatePart(parts, "minute"),
    second: getDatePart(parts, "second"),
  };
}

function getDatePart(parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>>, key: Intl.DateTimeFormatPartTypes): number {
  const value = parts[key];

  if (typeof value !== "number") {
    throw new Error(`Missing ${key} in provider quota date.`);
  }

  return value;
}

function roundCurrency(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100;
}
