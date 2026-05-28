import { describe, expect, test } from "vitest";
import { assertAdminRole, isAdminRole } from "../../lib/admin/auth";

describe("admin authorization", () => {
  test("allows ADMIN application role", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(() => assertAdminRole({ role: "ADMIN" })).not.toThrow();
  });

  test("rejects USER application role", () => {
    expect(isAdminRole("USER")).toBe(false);
    expect(() => assertAdminRole({ role: "USER" })).toThrow("Admin access is required.");
  });

  test("rejects missing application user", () => {
    expect(() => assertAdminRole(null)).toThrow("Admin access is required.");
  });
});
