const DEFAULT_EXPIRY_DAYS = 60;

export type TopicRecommendationExpiryPrisma = {
  topicRecommendation: {
    updateMany(input: {
      where: {
        status: "NEW";
        createdAt: { lt: Date };
      };
      data: { status: "EXPIRED" };
    }): Promise<{ count: number }>;
  };
};

export type TopicRecommendationExpirySummary = {
  cutoff: Date;
  expired: number;
};

export async function expireStaleTopicRecommendations(
  prisma: TopicRecommendationExpiryPrisma,
  input: { now?: Date; expiryDays?: number } = {},
): Promise<TopicRecommendationExpirySummary> {
  const expiryDays = input.expiryDays ?? DEFAULT_EXPIRY_DAYS;
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - expiryDays * 24 * 60 * 60 * 1000);
  const result = await prisma.topicRecommendation.updateMany({
    where: {
      status: "NEW",
      createdAt: { lt: cutoff },
    },
    data: { status: "EXPIRED" },
  });

  return {
    cutoff,
    expired: result.count,
  };
}
