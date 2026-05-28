import type { UserRole } from "@/generated/prisma/client";

const OWNER_EMAILS = new Set(["neilvinsern@gmail.com", "ginkomedia@gmail.com"]);
const ADMIN_EMAILS = new Set([...OWNER_EMAILS, "funnelphilia@gmail.com"]);

export function normalizeAccessEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isConfiguredOwnerEmail(email: string) {
  return OWNER_EMAILS.has(normalizeAccessEmail(email));
}

export function isConfiguredAdminEmail(email: string) {
  return ADMIN_EMAILS.has(normalizeAccessEmail(email));
}

export function getConfiguredUserRole(email: string): UserRole {
  return isConfiguredAdminEmail(email) ? "ADMIN" : "USER";
}
