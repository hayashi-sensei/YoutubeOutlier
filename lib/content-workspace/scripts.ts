import {
  outlineGenerationSchema,
  scriptGenerationSchema,
  type OutlineGenerationOutput,
  type ScriptGenerationOutput,
  type ScriptSectionGenerationOutput,
} from "@/schemas/content-generation";

export const SCRIPT_ASSET_TYPE = "script";
export const OPTIONAL_SCRIPT_CONTEXT_ASSET_TYPES = ["hook", "titles", "caption", "description"] as const;

export type OptionalScriptContextAssetType = (typeof OPTIONAL_SCRIPT_CONTEXT_ASSET_TYPES)[number];

export type ScriptContextAsset = {
  assetType: string;
  version: number;
  title?: string | null;
  jsonBody: unknown;
};

export type SelectedScriptContextAsset = {
  assetType: OptionalScriptContextAssetType;
  version: number;
  title: string | null;
  jsonBody: unknown;
};

export function selectLatestOutlineForScript(assets: ScriptContextAsset[]): OutlineGenerationOutput {
  const outlines = assets
    .filter((asset) => asset.assetType === "outline")
    .sort((a, b) => b.version - a.version);

  for (const asset of outlines) {
    const parsed = outlineGenerationSchema.safeParse(asset.jsonBody);
    if (parsed.success) {
      return parsed.data;
    }
  }

  throw new Error("Generate an outline before generating a script.");
}

export function selectLatestStructuredScript(assets: ScriptContextAsset[]): ScriptGenerationOutput {
  const scripts = assets
    .filter((asset) => asset.assetType === SCRIPT_ASSET_TYPE)
    .sort((a, b) => b.version - a.version);

  for (const asset of scripts) {
    const parsed = scriptGenerationSchema.safeParse(asset.jsonBody);
    if (parsed.success) {
      return parsed.data;
    }
  }

  throw new Error("Generate a full script before regenerating a section.");
}

export function selectOptionalScriptAssetContext(
  assets: ScriptContextAsset[],
  selectedAssetTypes: OptionalScriptContextAssetType[],
): SelectedScriptContextAsset[] {
  const selectedTypes = new Set(selectedAssetTypes);
  return OPTIONAL_SCRIPT_CONTEXT_ASSET_TYPES.flatMap((assetType) => {
    if (!selectedTypes.has(assetType)) {
      return [];
    }

    const latest = assets
      .filter((asset) => asset.assetType === assetType && asset.jsonBody)
      .sort((a, b) => b.version - a.version)[0];

    return latest
      ? [
          {
            assetType,
            version: latest.version,
            title: latest.title ?? null,
            jsonBody: latest.jsonBody,
          },
        ]
      : [];
  });
}

export function buildEditableScriptBody(output: ScriptGenerationOutput): string {
  return [
    `# ${output.title}`,
    "",
    `Estimated duration: ${output.estimatedDurationMinutes} minutes`,
    "",
    ...output.sections.flatMap((section) => [`## ${section.heading}`, "", section.script, ""]),
    "## Description",
    "",
    output.description,
  ].join("\n");
}

export function replaceScriptSection(
  script: ScriptGenerationOutput,
  section: ScriptSectionGenerationOutput & { sectionIndex: number },
): ScriptGenerationOutput {
  if (!Number.isInteger(section.sectionIndex) || section.sectionIndex < 0 || section.sectionIndex >= script.sections.length) {
    throw new Error("Script section index is out of range.");
  }

  return {
    ...script,
    sections: script.sections.map((existingSection, index) =>
      index === section.sectionIndex
        ? {
            heading: section.heading,
            script: section.script,
          }
        : existingSection,
    ),
  };
}
