-- Corrective hardening for environments that applied the first Spec 023 migration
-- before direct authenticated write policies were removed.

REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM authenticated;

DROP POLICY IF EXISTS "User_self_update" ON public."User";
DROP POLICY IF EXISTS "Workspace_authenticated_write" ON public."Workspace";
DROP POLICY IF EXISTS "WorkspaceMember_authenticated_write" ON public."WorkspaceMember";
DROP POLICY IF EXISTS "WorkspaceSettings_authenticated_write" ON public."WorkspaceSettings";
DROP POLICY IF EXISTS "WritingStyleSample_authenticated_write" ON public."WritingStyleSample";
DROP POLICY IF EXISTS "TrackedChannel_authenticated_write" ON public."TrackedChannel";
DROP POLICY IF EXISTS "CompetitorRecommendation_authenticated_write" ON public."CompetitorRecommendation";
DROP POLICY IF EXISTS "IndustrySource_authenticated_write" ON public."IndustrySource";
DROP POLICY IF EXISTS "TopicRecommendation_authenticated_write" ON public."TopicRecommendation";
DROP POLICY IF EXISTS "ResearchReport_authenticated_write" ON public."ResearchReport";
DROP POLICY IF EXISTS "ContentItem_authenticated_write" ON public."ContentItem";
DROP POLICY IF EXISTS "ContentAsset_authenticated_write" ON public."ContentAsset";
DROP POLICY IF EXISTS "VisualAsset_authenticated_write" ON public."VisualAsset";
DROP POLICY IF EXISTS "PlanLimit_admin_write" ON public."PlanLimit";
DROP POLICY IF EXISTS "AiTaskRouteOverride_admin_write" ON public."AiTaskRouteOverride";
DROP POLICY IF EXISTS "AdminAuditLog_admin_write" ON public."AdminAuditLog";
DROP POLICY IF EXISTS "YoutubeQuotaUsage_admin_write" ON public."YoutubeQuotaUsage";
