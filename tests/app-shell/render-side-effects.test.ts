import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("AppShell render behavior", () => {
  test("does not trigger competitor discovery from the layout render path", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "app-shell", "app-shell.tsx"), "utf8");

    expect(source).not.toContain("ensureCompetitorRecommendations");
    expect(source).not.toContain("@/lib/competitors/discovery");
  });
});
