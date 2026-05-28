import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getPrismaClient } from "@/lib/db/prisma";

export async function GET() {
  if (!env.DATABASE_URL) {
    return NextResponse.json(
      {
        status: "degraded",
        app: "ok",
        database: "not_configured",
      },
      { status: 503 },
    );
  }

  try {
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ok",
      app: "ok",
      database: "ok",
    });
  } catch (error) {
    const databaseError =
      process.env.NODE_ENV === "production"
        ? undefined
        : error instanceof Error
          ? error.message
          : "Unknown database error";

    return NextResponse.json(
      {
        status: "degraded",
        app: "ok",
        database: "unreachable",
        databaseError,
      },
      { status: 503 },
    );
  }
}
