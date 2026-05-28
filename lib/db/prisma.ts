import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaPool?: pg.Pool;
};

const DEFAULT_DATABASE_POOL_MAX = 5;

function createPrismaClient() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to create PrismaClient.");
  }

  const pool =
    globalForPrisma.prismaPool ??
    new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: DEFAULT_DATABASE_POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: {
        rejectUnauthorized: false,
      },
    });
  globalForPrisma.prismaPool = pool;

  return new PrismaClient({
    adapter: new PrismaPg(pool),
  });
}

export function getPrismaClient() {
  const prisma = hasCurrentDelegates(globalForPrisma.prisma)
    ? globalForPrisma.prisma
    : createPrismaClient();

  globalForPrisma.prisma = prisma;

  return prisma;
}

function hasCurrentDelegates(prisma: PrismaClient | undefined): prisma is PrismaClient {
  if (!prisma) {
    return false;
  }

  return (
    "competitorBlueprint" in prisma &&
    "account" in prisma &&
    "session" in prisma &&
    "verificationToken" in prisma &&
    "userRoleLimit" in prisma &&
    modelHasFields(prisma, "VisualAsset", [
      "aiGenerationId",
      "aspectRatio",
      "visualStrategy",
      "editableOverlays",
    ])
  );
}

function modelHasFields(prisma: PrismaClient, modelName: string, fieldNames: string[]): boolean {
  const runtimeModel = (prisma as unknown as {
    _runtimeDataModel?: {
      models?: Record<string, { fields?: Array<{ name?: string }> }>;
    };
  })._runtimeDataModel?.models?.[modelName];
  const currentFieldNames = new Set((runtimeModel?.fields ?? []).map((field) => field.name).filter(Boolean));

  return fieldNames.every((fieldName) => currentFieldNames.has(fieldName));
}
