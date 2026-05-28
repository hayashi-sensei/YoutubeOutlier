import { describe, expect, test } from "vitest";
import { getConfiguredUserRole, isConfiguredOwnerEmail } from "../../lib/auth/access";

describe("configured app access", () => {
  test("treats founder owner emails as owners and admins", () => {
    expect(isConfiguredOwnerEmail("neilvinsern@gmail.com")).toBe(true);
    expect(isConfiguredOwnerEmail("GINKOMEDIA@gmail.com")).toBe(true);
    expect(getConfiguredUserRole("neilvinsern@gmail.com")).toBe("ADMIN");
    expect(getConfiguredUserRole("ginkomedia@gmail.com")).toBe("ADMIN");
  });

  test("treats configured admin email as admin but not owner", () => {
    expect(isConfiguredOwnerEmail("funnelphilia@gmail.com")).toBe(false);
    expect(getConfiguredUserRole("funnelphilia@gmail.com")).toBe("ADMIN");
  });

  test("defaults unlisted emails to user role", () => {
    expect(isConfiguredOwnerEmail("viewer@example.com")).toBe(false);
    expect(getConfiguredUserRole("viewer@example.com")).toBe("USER");
  });
});
