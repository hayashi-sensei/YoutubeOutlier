type MutationResult = { updated: boolean };
type ActiveRecommendationStatusFilter = { notIn: Array<"DISMISSED"> };

export type RecommendationMutationPrisma = {
  topicRecommendation: {
    updateMany(input: {
      where: { id: string; workspaceId: string; status?: ActiveRecommendationStatusFilter };
      data: { status: "SAVED" | "DISMISSED" };
    }): Promise<{ count: number }>;
    deleteMany(input: {
      where: { id: string; workspaceId: string };
    }): Promise<{ count: number }>;
  };
};

export type CalendarMutationPrisma = {
  topicRecommendation: {
    findFirst(input: {
      where: { id: string; workspaceId: string; status?: ActiveRecommendationStatusFilter };
      select: {
        id: true;
        workspaceId: true;
        suggestedTitle: true;
        title: true;
        topic: true;
      };
    }): Promise<{
      id: string;
      workspaceId: string;
      suggestedTitle: string | null;
      title: string;
      topic: string;
    } | null>;
    update(input: {
      where: { id: string };
      data: { status: "USED" };
    }): Promise<{ id: string }>;
  };
  contentItem: {
    findFirst(input: {
      where: { workspaceId: string; recommendationId: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(input: {
      data: {
        workspaceId: string;
        recommendationId: string;
        title: string;
        contentType: string;
        status: "IDEA";
        notes: string;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
};

export async function saveTopicRecommendation(
  prisma: RecommendationMutationPrisma,
  input: { workspaceId: string; recommendationId: string },
): Promise<MutationResult> {
  const result = await prisma.topicRecommendation.updateMany({
    where: {
      id: input.recommendationId,
      workspaceId: input.workspaceId,
      status: { notIn: ["DISMISSED"] },
    },
    data: { status: "SAVED" },
  });

  return { updated: result.count > 0 };
}

export async function dismissTopicRecommendation(
  prisma: RecommendationMutationPrisma,
  input: { workspaceId: string; recommendationId: string },
): Promise<MutationResult> {
  const result = await prisma.topicRecommendation.deleteMany({
    where: {
      id: input.recommendationId,
      workspaceId: input.workspaceId,
    },
  });

  return { updated: result.count > 0 };
}

export async function saveRecommendationToCalendar(
  prisma: CalendarMutationPrisma,
  input: { workspaceId: string; recommendationId: string },
): Promise<{ contentItemId: string; reused: boolean }> {
  const recommendation = await prisma.topicRecommendation.findFirst({
    where: {
      id: input.recommendationId,
      workspaceId: input.workspaceId,
      status: { notIn: ["DISMISSED"] },
    },
    select: {
      id: true,
      workspaceId: true,
      suggestedTitle: true,
      title: true,
      topic: true,
    },
  });

  if (!recommendation) {
    throw new Error("Recommendation was not found for this workspace.");
  }

  const existing = await prisma.contentItem.findFirst({
    where: {
      workspaceId: input.workspaceId,
      recommendationId: input.recommendationId,
    },
    select: { id: true },
  });
  if (existing) {
    await prisma.topicRecommendation.update({
      where: { id: input.recommendationId },
      data: { status: "USED" },
    });
    return { contentItemId: existing.id, reused: true };
  }

  const contentItem = await prisma.contentItem.create({
    data: {
      workspaceId: input.workspaceId,
      recommendationId: input.recommendationId,
      title: recommendation.suggestedTitle ?? recommendation.title,
      contentType: "youtube_video",
      status: "IDEA",
      notes: `Created from topic recommendation: ${recommendation.topic}`,
    },
    select: { id: true },
  });

  await prisma.topicRecommendation.update({
    where: { id: input.recommendationId },
    data: { status: "USED" },
  });

  return { contentItemId: contentItem.id, reused: false };
}
