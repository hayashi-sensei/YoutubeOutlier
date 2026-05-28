import { describe, expect, test } from "vitest";

import {
  buildEditableRepurposingBody,
  repurposingAssetType,
  selectRepurposingSourceContext,
} from "../../lib/content-workspace/repurposing";
import type {
  OutlineGenerationOutput,
  RepurposingGenerationOutput,
  ScriptGenerationOutput,
} from "../../schemas/content-generation";

const outline: OutlineGenerationOutput = {
  title: "A useful outline",
  hookOptions: ["Hook A", "Hook B", "Hook C"],
  sections: Array.from({ length: 5 }, (_, index) => ({
    heading: `Section ${index + 1}`,
    purpose: "Teach one clear idea.",
    talkingPoints: ["Point A", "Point B"],
  })),
  cta: "Subscribe for more.",
};

const script: ScriptGenerationOutput = {
  title: "A useful script",
  estimatedDurationMinutes: 9,
  sections: Array.from({ length: 5 }, (_, index) => ({
    heading: `Section ${index + 1}`,
    script: `Script body ${index + 1}`,
  })),
  description: "Description",
};

describe("repurposing workspace helpers", () => {
  test("selects a valid latest outline as repurposing source context", () => {
    const selected = selectRepurposingSourceContext(
      [
        { assetType: "outline", version: 1, title: "Old", jsonBody: { title: "Too thin" } },
        { assetType: "outline", version: 2, title: "Outline", jsonBody: outline },
        { assetType: "script", version: 1, title: "Script", jsonBody: script },
      ],
      "outline",
      {
        title: "Topic",
        manualTopic: null,
        notes: null,
        evidenceSnapshot: { evidences: [] },
      },
    );

    expect(selected).toEqual({ sourceType: "outline", outline });
  });

  test("rejects outline source when no valid outline exists", () => {
    expect(() =>
      selectRepurposingSourceContext(
        [{ assetType: "outline", version: 1, title: "Old", jsonBody: { title: "Too thin" } }],
        "outline",
        {
          title: "Topic",
          manualTopic: null,
          notes: null,
          evidenceSnapshot: { evidences: [] },
        },
      ),
    ).toThrow("Generate a YouTube outline before repurposing from an outline.");
  });

  test("uses an attached research report for report-source repurposing", () => {
    const report = {
      id: "report-1",
      title: "Weekly AI workflow report",
      summary: "Three competitor uploads show workflow implementation is spiking.",
      reportDate: new Date("2026-05-18T00:00:00.000Z"),
      sectionsJson: {
        outliers: ["AI agent build videos are outperforming"],
        recommendations: ["Create a practical workflow tutorial"],
      },
    };

    const selected = selectRepurposingSourceContext([], "report", {
      title: "Topic",
      manualTopic: null,
      notes: null,
      evidenceSnapshot: { evidences: [] },
      report,
    });

    expect(selected).toEqual({ sourceType: "report", report });
  });

  test("rejects report source when no research report is attached", () => {
    expect(() =>
      selectRepurposingSourceContext([], "report", {
        title: "Topic",
        manualTopic: null,
        notes: null,
        evidenceSnapshot: { evidences: [] },
      }),
    ).toThrow("Open a report-backed recommendation before repurposing from a report.");
  });

  test("builds an editable draft body with the image concept preserved", () => {
    const output: RepurposingGenerationOutput = {
      title: "LinkedIn post",
      format: "LINKEDIN_EDUCATIONAL",
      sourceType: "script",
      primaryDraft: "Teach the lesson in a concise post.",
      hook: "Most creators skip this step.",
      cta: "Subscribe",
      platformNotes: ["Short paragraphs", "Use concrete proof"],
      imageConcept: {
        headline: "Stop Skipping This",
        visualMetaphor: "Checklist beside a creator dashboard",
        composition: "A clean two-column layout",
        editableTextOverlays: ["Stop skipping this", "5-minute fix"],
        aspectRatio: "4:5",
      },
    };

    expect(buildEditableRepurposingBody(output)).toContain("## LinkedIn Image Concept");
    expect(buildEditableRepurposingBody(output)).toContain("Stop Skipping This");
    expect(repurposingAssetType("LINKEDIN_EDUCATIONAL")).toBe("repurpose_linkedin_educational");
  });
});
