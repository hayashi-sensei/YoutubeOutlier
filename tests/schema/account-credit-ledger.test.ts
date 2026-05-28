import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("account credit ledger schema", () => {
  test("keeps credit transaction rows when a workspace is deleted", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");

    expect(schema).toContain("workspaceId    String?");
    expect(schema).toContain("workspace      Workspace?             @relation(fields: [workspaceId], references: [id], onDelete: SetNull)");
  });
});
