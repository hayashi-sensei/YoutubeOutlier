import { describe, expect, test } from "vitest";

import {
  SCRIPT_ASSET_TYPE,
  buildEditableScriptBody,
  selectOptionalScriptAssetContext,
  replaceScriptSection,
  selectLatestOutlineForScript,
} from "../../lib/content-workspace/scripts";
import type { OutlineGenerationOutput, ScriptGenerationOutput } from "../../schemas/content-generation";

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

describe("script workspace helpers", () => {
  test("selects the latest outline asset as required script context", () => {
    const selected = selectLatestOutlineForScript([
      { assetType: "outline", version: 1, jsonBody: { ...outline, title: "Old outline" } },
      { assetType: "caption", version: 4, jsonBody: { title: "Caption" } },
      { assetType: "outline", version: 2, jsonBody: outline },
    ]);

    expect(selected).toEqual(outline);
  });

  test("rejects script generation when no valid outline exists", () => {
    expect(() =>
      selectLatestOutlineForScript([{ assetType: "outline", version: 1, jsonBody: { title: "Too thin" } }]),
    ).toThrow("Generate an outline before generating a script.");
  });

  test("builds an editable full-script body from structured script output", () => {
    expect(buildEditableScriptBody(script)).toContain("# A useful script");
    expect(buildEditableScriptBody(script)).toContain("Estimated duration: 9 minutes");
    expect(buildEditableScriptBody(script)).toContain("## Section 1");
    expect(buildEditableScriptBody(script)).toContain("Script body 5");
  });

  test("regenerates one script section while preserving the rest of the script", () => {
    const updated = replaceScriptSection(script, {
      sectionIndex: 2,
      heading: "New section",
      script: "Replacement body",
    });

    expect(updated.sections[0]?.script).toBe("Script body 1");
    expect(updated.sections[2]).toEqual({ heading: "New section", script: "Replacement body" });
    expect(updated.sections[4]?.script).toBe("Script body 5");
    expect(SCRIPT_ASSET_TYPE).toBe("script");
  });

  test("selects only requested latest optional assets for script context", () => {
    const context = selectOptionalScriptAssetContext(
      [
        { assetType: "hook", version: 1, title: "Old hooks", jsonBody: { hooks: ["old"] } },
        { assetType: "hook", version: 2, title: "New hooks", jsonBody: { hooks: ["new"] } },
        { assetType: "titles", version: 1, title: "Titles", jsonBody: { titles: ["Title"] } },
        { assetType: "caption", version: 1, title: "Captions", jsonBody: { captions: ["Caption"] } },
        { assetType: "description", version: 1, title: "Description", jsonBody: { description: "Desc" } },
        { assetType: "script", version: 1, title: "Script", jsonBody: script },
      ],
      ["hook", "description"],
    );

    expect(context).toEqual([
      { assetType: "hook", version: 2, title: "New hooks", jsonBody: { hooks: ["new"] } },
      { assetType: "description", version: 1, title: "Description", jsonBody: { description: "Desc" } },
    ]);
  });
});
