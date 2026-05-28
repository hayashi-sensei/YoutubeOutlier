import { inflateRawSync } from "node:zlib";
import { describe, expect, test } from "vitest";

import {
  renderResearchReportDocx,
  renderResearchReportMarkdown,
  renderResearchReportPdf,
} from "../../lib/reports/export";
import type { ResearchReportDetail } from "../../lib/reports/queries";

describe("report export rendering", () => {
  test("renders report sections, recommendations, and evidence as markdown", () => {
    const report = {
      id: "report-1",
      workspaceId: "workspace-1",
      title: "Daily Research Report",
      status: "COMPLETED",
      reportDate: new Date("2026-05-18T00:00:00Z"),
      manualRun: false,
      summary: "Generated 5 evidence-backed topic recommendations.",
      sections: {
        executiveSummary: {
          headline: "Research report for AI",
          keySignals: ["3 competitor videos analyzed", "2 industry source items reviewed"],
        },
        competitorUploads: [
          {
            title: "I Built 7 AI Agents",
            channelTitle: "AI Automation Lab",
            youtubeUrl: "https://www.youtube.com/watch?v=yt-1",
          },
        ],
        industryNews: [
          {
            title: "New agent workflow update announced",
            sourceName: "OpenAI Blog",
            url: "https://openai.com/news/agent-workflow-update",
          },
        ],
        recommendedActions: ["Create an outline for AI agents first."],
      },
      errorMessage: null,
      generatedAt: new Date("2026-05-18T00:01:00Z"),
      createdAt: new Date("2026-05-18T00:00:00Z"),
      exports: [],
      recommendations: [
        {
          id: "rec-1",
          title: "AI agents",
          topic: "AI agents",
          angle: "Practical workflow",
          whyNow: "Outliers and source coverage align.",
          opportunityScore: 91,
          suggestedTitle: "Build AI Agents",
          thumbnailConcept: "Creator dashboard with AI agent cards",
          evidences: [
            {
              id: "ev-1",
              evidenceType: "competitor_outlier",
              note: "Strong lift.",
              video: {
                id: "video-1",
                youtubeVideoId: "yt-1",
                title: "I Built 7 AI Agents",
                thumbnailUrl: "https://img.youtube.com/vi/yt-1/hqdefault.jpg",
                channel: { title: "AI Automation Lab", handle: "@lab" },
              },
              sourceItem: null,
            },
          ],
        },
      ],
    } satisfies ResearchReportDetail;
    const markdown = renderResearchReportMarkdown(report);

    expect(markdown).toContain("# Daily Research Report");
    expect(markdown).toContain("Generated 5 evidence-backed topic recommendations.");
    expect(markdown).toContain("## Executive Summary");
    expect(markdown).toContain("- 3 competitor videos analyzed");
    expect(markdown).toContain("- [I Built 7 AI Agents](https://www.youtube.com/watch?v=yt-1) (AI Automation Lab)");
    expect(markdown).toContain("- [New agent workflow update announced](https://openai.com/news/agent-workflow-update) (OpenAI Blog)");
    expect(markdown).toContain("## Recommended Topics");
    expect(markdown).toContain("### AI agents");
    expect(markdown).toContain("- Evidence: I Built 7 AI Agents (AI Automation Lab) - Strong lift.");
    expect(markdown).toContain("## Recommended Actions");
    expect(markdown).toContain("- Create an outline for AI agents first.");
  });

  test("renders branded report content as a PDF file", () => {
    const pdf = renderResearchReportPdf({
      ...reportFixture(),
      summary: "This deliberately long summary should wrap into more than one line instead of running off the page because export documents need to be readable by clients and operators.",
    }, {
      workspaceName: "Founder Workspace",
      primaryNiche: "AI automation",
      brandVoice: "Direct and evidence-led",
    });

    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/BaseFont /Helvetica-Bold");
    expect(text).toContain("0.06 0.46 0.43 rg");
    expect(text).toContain("/F2 22 Tf");
    expect(text).toContain("/F2 14 Tf");
    expect(text).toContain("Founder Workspace");
    expect(text).toContain("AI automation");
    expect(text).toContain("Daily Research Report");
    expect(text).toContain("This deliberately long summary should wrap into more than one line instead of running");
    expect(text).toContain("off the page because export documents need to be readable by clients and operators.");
    expect(text).toContain("%%EOF");
  });

  test("renders branded report content as a DOCX file", () => {
    const docx = renderResearchReportDocx(reportFixture(), {
      workspaceName: "Founder Workspace",
      primaryNiche: "AI automation",
      brandVoice: "Direct and evidence-led",
    });

    expect(docx.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(readZipText(docx, "_rels/.rels")).toContain("officeDocument");
    expect(readZipText(docx, "docProps/core.xml")).toContain("Daily Research Report");
    expect(readZipText(docx, "docProps/app.xml")).toContain("YTResearch");
    expect(readZipText(docx, "word/styles.xml")).toContain("YTResearchNormal");
    expect(readZipText(docx, "word/_rels/document.xml.rels")).toContain("Relationships");
    const documentXml = readZipText(docx, "word/document.xml");
    expect(documentXml).toContain("Founder Workspace");
    expect(documentXml).toContain("AI automation");
    expect(documentXml).toContain("Daily Research Report");
    expect(documentXml).toContain("Create an outline for AI agents first.");
  });
});

function reportFixture(): ResearchReportDetail {
  return {
    id: "report-1",
    workspaceId: "workspace-1",
    title: "Daily Research Report",
    status: "COMPLETED",
    reportDate: new Date("2026-05-18T00:00:00Z"),
    manualRun: false,
    summary: "Generated 5 evidence-backed topic recommendations.",
    sections: {
      executiveSummary: {
        headline: "Research report for AI",
        keySignals: ["3 competitor videos analyzed", "2 industry source items reviewed"],
      },
      competitorUploads: [
        {
          title: "I Built 7 AI Agents",
          channelTitle: "AI Automation Lab",
          youtubeUrl: "https://www.youtube.com/watch?v=yt-1",
        },
      ],
      industryNews: [
        {
          title: "New agent workflow update announced",
          sourceName: "OpenAI Blog",
          url: "https://openai.com/news/agent-workflow-update",
        },
      ],
      recommendedActions: ["Create an outline for AI agents first."],
    },
    errorMessage: null,
    generatedAt: new Date("2026-05-18T00:01:00Z"),
    createdAt: new Date("2026-05-18T00:00:00Z"),
    exports: [],
    recommendations: [
      {
        id: "rec-1",
        title: "AI agents",
        topic: "AI agents",
        angle: "Practical workflow",
        whyNow: "Outliers and source coverage align.",
        opportunityScore: 91,
        suggestedTitle: "Build AI Agents",
        thumbnailConcept: "Creator dashboard with AI agent cards",
        evidences: [],
      },
    ],
  };
}

function readZipText(zip: Buffer, path: string): string {
  let offset = 0;
  while (offset < zip.length) {
    if (zip.readUInt32LE(offset) !== 0x04034b50) {
      break;
    }

    const compressionMethod = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const fileNameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const fileName = zip.subarray(offset + 30, offset + 30 + fileNameLength).toString("utf8");
    const dataStart = offset + 30 + fileNameLength + extraLength;
    const data = zip.subarray(dataStart, dataStart + compressedSize);

    if (fileName === path) {
      return (compressionMethod === 8 ? inflateRawSync(data) : data).toString("utf8");
    }

    offset = dataStart + compressedSize;
  }

  throw new Error(`Zip entry not found: ${path}`);
}
