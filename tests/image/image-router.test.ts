import { describe, expect, test } from "vitest";

import { imageGenerationDimensions, requireGeneratedImageFiles } from "../../lib/image/image-router";

describe("imageGenerationDimensions", () => {
  test("uses OpenAI image sizes instead of unsupported aspectRatio", () => {
    expect(imageGenerationDimensions("openai", "16:9")).toEqual({ size: "1536x1024" });
    expect(imageGenerationDimensions("openai", "1:1")).toEqual({ size: "1024x1024" });
    expect(imageGenerationDimensions("openai", "4:5")).toEqual({ size: "1024x1536" });
  });

  test("uses aspectRatio for image providers that support it", () => {
    expect(imageGenerationDimensions("google", "16:9")).toEqual({ aspectRatio: "16:9" });
    expect(imageGenerationDimensions("xai", "4:5")).toEqual({ aspectRatio: "4:5" });
  });

  test("rejects image generations with no generated files", () => {
    expect(() => requireGeneratedImageFiles({ files: [] })).toThrow("Image provider returned no generated files");
    expect(() => requireGeneratedImageFiles({ providerMetadata: {} })).toThrow("Image provider returned no generated files");
  });
});
