import { describe, expect, test, vi } from "vitest";

import { getWorkspaceResearchReportDetail } from "../../lib/reports/queries";

describe("report queries", () => {
  test("loads a workspace-scoped report with sections, recommendations, evidence, and exports", async () => {
    const prisma = {
      researchReport: {
        findFirst: vi.fn(async () => ({
          id: "report-1",
          workspaceId: "workspace-1",
          title: "Research report",
          status: "COMPLETED",
          reportDate: new Date("2026-05-18T00:00:00Z"),
          manualRun: true,
          summary: "Generated 5 evidence-backed topic recommendations.",
          sectionsJson: {
            executiveSummary: { headline: "Research report for AI" },
            recommendedTopics: [{ topic: "AI agents", evidenceCount: 2 }],
          },
          errorMessage: null,
          generatedAt: new Date("2026-05-18T00:01:00Z"),
          createdAt: new Date("2026-05-18T00:00:00Z"),
          recommendations: [
            {
              id: "rec-1",
              title: "AI agents",
              topic: "AI agents",
              angle: "Practical workflow",
              whyNow: "Outliers and source coverage align.",
              opportunityScore: 91,
              suggestedTitle: "Build AI Agents",
              evidences: [
                {
                  id: "ev-1",
                  evidenceType: "competitor_outlier",
                  note: "Strong lift.",
                  video: {
                    id: "video-1",
                    youtubeVideoId: "yt-1",
                    title: "I Built 7 AI Agents",
                    channel: { title: "AI Automation Lab", handle: "@lab" },
                  },
                  sourceItem: null,
                },
              ],
            },
          ],
          exports: [
            {
              id: "export-1",
              fileType: "markdown",
              storagePath: "reports/report-1.md",
              downloadUrl: "/api/reports/report-1/export/markdown",
              expiresAt: null,
              createdAt: new Date("2026-05-18T00:02:00Z"),
            },
          ],
        })),
      },
    };

    const report = await getWorkspaceResearchReportDetail(prisma, {
      workspaceId: "workspace-1",
      reportId: "report-1",
    });

    expect(prisma.researchReport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "report-1", workspaceId: "workspace-1" },
      }),
    );
    expect(report).toEqual(
      expect.objectContaining({
        id: "report-1",
        sections: expect.objectContaining({
          executiveSummary: { headline: "Research report for AI" },
        }),
        recommendations: expect.arrayContaining([
          expect.objectContaining({
            id: "rec-1",
            evidences: expect.arrayContaining([
              expect.objectContaining({
                video: expect.objectContaining({ youtubeVideoId: "yt-1" }),
              }),
            ]),
          }),
        ]),
        exports: expect.arrayContaining([
          expect.objectContaining({ fileType: "markdown" }),
        ]),
      }),
    );
  });

  test("hydrates legacy report video sections with public YouTube links", async () => {
    const prisma = {
      researchReport: {
        findFirst: vi.fn(async () => ({
          id: "report-legacy",
          workspaceId: "workspace-1",
          title: "Legacy report",
          status: "COMPLETED",
          reportDate: new Date("2026-05-18T00:00:00Z"),
          manualRun: true,
          summary: "Legacy report sections without links.",
          sectionsJson: {
            competitorUploads: [
              {
                youtubeVideoId: "video-1",
                title: "I Built 7 AI Agents",
                channelTitle: "AI Automation Lab",
              },
            ],
            outliers: [
              {
                youtubeVideoId: "video-1",
                title: "I Built 7 AI Agents",
                channelTitle: "AI Automation Lab",
              },
            ],
          },
          errorMessage: null,
          generatedAt: new Date("2026-05-18T00:01:00Z"),
          createdAt: new Date("2026-05-18T00:00:00Z"),
          recommendations: [],
          exports: [],
        })),
      },
      youtubeVideo: {
        findMany: vi.fn(async () => [
          {
            id: "video-1",
            youtubeVideoId: "yt-public-1",
          },
        ]),
      },
    };

    const report = await getWorkspaceResearchReportDetail(prisma, {
      workspaceId: "workspace-1",
      reportId: "report-legacy",
    });

    expect(prisma.youtubeVideo.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["video-1"] } },
      select: { id: true, youtubeVideoId: true },
    });
    expect(report?.sections.competitorUploads).toEqual([
      expect.objectContaining({
        youtubeVideoId: "video-1",
        publicYoutubeVideoId: "yt-public-1",
        youtubeUrl: "https://www.youtube.com/watch?v=yt-public-1",
      }),
    ]);
    expect(report?.sections.outliers).toEqual([
      expect.objectContaining({
        youtubeVideoId: "video-1",
        publicYoutubeVideoId: "yt-public-1",
        youtubeUrl: "https://www.youtube.com/watch?v=yt-public-1",
      }),
    ]);
  });
});
