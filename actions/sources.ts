"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserWorkspace } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  HttpSourceFetchProvider,
  ingestIndustrySource,
  type IndustrySourceIngestionTx,
} from "@/lib/sources/ingestion";
import { addIndustrySourceSchema, industrySourceIdSchema } from "@/schemas/sources";

function redirectTo(url: string): never {
  redirect(url as never);
}

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : undefined;
}

function normalizeSourceUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function sourceTypeFromUrl(url: string) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".rss") || pathname.endsWith(".xml") || pathname.includes("feed")) {
    return "RSS" as const;
  }

  return "WEBSITE" as const;
}

async function getWorkspaceId() {
  const { workspaceId } = await requireUserWorkspace("/app/sources");
  return workspaceId;
}

export async function addIndustrySource(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  const parsedInput = addIndustrySourceSchema.safeParse({
    url: String(formData.get("url") ?? ""),
    name: optionalString(formData, "name"),
  });

  if (!parsedInput.success) {
    redirectTo("/app/sources?error=INVALID_SOURCE_INPUT");
  }

  const url = normalizeSourceUrl(parsedInput.data.url);
  const prisma = getPrismaClient();

  await prisma.industrySource.upsert({
    where: {
      workspaceId_url: {
        workspaceId,
        url,
      },
    },
    create: {
      workspaceId,
      url,
      name: parsedInput.data.name,
      sourceType: sourceTypeFromUrl(url),
      isActive: true,
    },
    update: {
      name: parsedInput.data.name,
      sourceType: sourceTypeFromUrl(url),
      isActive: true,
    },
  });

  revalidatePath("/app/sources");
  redirectTo("/app/sources?added=1");
}

export async function archiveIndustrySource(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  const parsedInput = industrySourceIdSchema.safeParse({
    sourceId: String(formData.get("sourceId") ?? ""),
  });

  if (!parsedInput.success) {
    redirectTo("/app/sources?error=INVALID_SOURCE");
  }

  const prisma = getPrismaClient();
  const updated = await prisma.industrySource.updateMany({
    where: {
      id: parsedInput.data.sourceId,
      workspaceId,
      isActive: true,
    },
    data: {
      isActive: false,
    },
  });

  if (updated.count === 0) {
    redirectTo("/app/sources?error=SOURCE_NOT_FOUND");
  }

  revalidatePath("/app/sources");
  redirectTo("/app/sources?archived=1");
}

export async function fetchIndustrySourceItems(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  const parsedInput = industrySourceIdSchema.safeParse({
    sourceId: String(formData.get("sourceId") ?? ""),
  });

  if (!parsedInput.success) {
    redirectTo("/app/sources?error=INVALID_SOURCE");
  }

  const prisma = getPrismaClient();
  const source = await prisma.industrySource.findFirst({
    where: {
      id: parsedInput.data.sourceId,
      workspaceId,
      isActive: true,
    },
    select: {
      id: true,
      url: true,
      rssUrl: true,
    },
  });

  if (!source) {
    redirectTo("/app/sources?error=SOURCE_NOT_FOUND");
  }

  try {
    await ingestIndustrySource({
      tx: prisma as unknown as IndustrySourceIngestionTx,
      provider: new HttpSourceFetchProvider(),
      source,
      mode: "initial",
      maxItems: 20,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Source fetch failed.";
    redirectTo(`/app/sources?error=SOURCE_FETCH_FAILED&details=${encodeURIComponent(message)}`);
  }

  revalidatePath("/app/sources");
  revalidatePath("/app/dashboard");
  redirectTo("/app/sources?fetched=1");
}
