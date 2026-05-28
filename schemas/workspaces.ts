import { z } from "zod";

export const workspaceCreateSchema = z.object({
  name: z.string().trim().min(2, "Workspace name is required.").max(80),
  primaryNiche: z.string().trim().min(2, "Primary niche is required.").max(160),
  targetAudience: z.string().trim().max(500).optional(),
});

export const workspaceSwitchSchema = z.object({
  workspaceId: z.string().trim().min(1, "Workspace is required."),
  redirectTo: z.string().trim().optional(),
});

export const workspaceDeleteSchema = z.object({
  workspaceId: z.string().trim().min(1, "Workspace is required."),
  confirmationName: z.string().trim().min(1, "Type the workspace name to confirm."),
});

export type WorkspaceCreateSchemaInput = z.infer<typeof workspaceCreateSchema>;
