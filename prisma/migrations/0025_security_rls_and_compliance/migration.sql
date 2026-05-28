-- Spec 023: Security, RLS, and Compliance.
-- This migration turns the earlier "RLS enabled, direct access revoked" baseline into
-- explicit authenticated policies for user-owned data, admin-only operational data,
-- and workspace-prefixed storage objects.

CREATE SCHEMA IF NOT EXISTS yt_app;

CREATE OR REPLACE FUNCTION yt_app.current_app_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u."id"
  FROM public."User" u
  WHERE u."supabaseUserId" = auth.uid()::text
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION yt_app.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."User" u
    WHERE u."id" = yt_app.current_app_user_id()
      AND u."role" = 'ADMIN'
  )
$$;

CREATE OR REPLACE FUNCTION yt_app.is_workspace_member(workspace_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."Workspace" w
    WHERE w."id" = workspace_id
      AND w."ownerId" = yt_app.current_app_user_id()
  )
  OR EXISTS (
    SELECT 1
    FROM public."WorkspaceMember" wm
    WHERE wm."workspaceId" = workspace_id
      AND wm."userId" = yt_app.current_app_user_id()
  )
$$;

CREATE OR REPLACE FUNCTION yt_app.can_access_settings(settings_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."WorkspaceSettings" ws
    WHERE ws."id" = settings_id
      AND yt_app.is_workspace_member(ws."workspaceId")
  )
$$;

CREATE OR REPLACE FUNCTION yt_app.can_access_source(source_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."IndustrySource" s
    WHERE s."id" = source_id
      AND yt_app.is_workspace_member(s."workspaceId")
  )
$$;

CREATE OR REPLACE FUNCTION yt_app.can_access_recommendation(recommendation_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."TopicRecommendation" r
    WHERE r."id" = recommendation_id
      AND yt_app.is_workspace_member(r."workspaceId")
  )
$$;

CREATE OR REPLACE FUNCTION yt_app.can_access_content_item(content_item_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."ContentItem" c
    WHERE c."id" = content_item_id
      AND yt_app.is_workspace_member(c."workspaceId")
  )
$$;

CREATE OR REPLACE FUNCTION yt_app.can_access_report(report_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."ResearchReport" r
    WHERE r."id" = report_id
      AND yt_app.is_workspace_member(r."workspaceId")
  )
$$;

CREATE OR REPLACE FUNCTION yt_app.can_access_youtube_video(video_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."YoutubeVideo" v
    JOIN public."TrackedChannel" tc ON tc."youtubeChannelId" = v."youtubeChannelId"
    WHERE v."id" = video_id
      AND yt_app.is_workspace_member(tc."workspaceId")
  )
$$;

GRANT USAGE ON SCHEMA yt_app TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA yt_app TO authenticated;

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "User_self_select" ON public."User";
CREATE POLICY "User_self_select"
  ON public."User"
  FOR SELECT
  TO authenticated
  USING ("id" = yt_app.current_app_user_id() OR yt_app.is_admin());

DROP POLICY IF EXISTS "User_self_update" ON public."User";

ALTER TABLE public."Workspace" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Workspace_authenticated_select" ON public."Workspace";
CREATE POLICY "Workspace_authenticated_select"
  ON public."Workspace"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_workspace_member("id") OR yt_app.is_admin());

DROP POLICY IF EXISTS "Workspace_authenticated_write" ON public."Workspace";

ALTER TABLE public."WorkspaceMember" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "WorkspaceMember_authenticated_select" ON public."WorkspaceMember";
CREATE POLICY "WorkspaceMember_authenticated_select"
  ON public."WorkspaceMember"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_workspace_member("workspaceId") OR yt_app.is_admin());

DROP POLICY IF EXISTS "WorkspaceMember_authenticated_write" ON public."WorkspaceMember";

ALTER TABLE public."WorkspaceSettings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "WorkspaceSettings_authenticated_select" ON public."WorkspaceSettings";
CREATE POLICY "WorkspaceSettings_authenticated_select"
  ON public."WorkspaceSettings"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_workspace_member("workspaceId") OR yt_app.is_admin());

DROP POLICY IF EXISTS "WorkspaceSettings_authenticated_write" ON public."WorkspaceSettings";

ALTER TABLE public."WritingStyleSample" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "WritingStyleSample_authenticated_select" ON public."WritingStyleSample";
CREATE POLICY "WritingStyleSample_authenticated_select"
  ON public."WritingStyleSample"
  FOR SELECT
  TO authenticated
  USING (yt_app.can_access_settings("settingsId") OR yt_app.is_admin());

DROP POLICY IF EXISTS "WritingStyleSample_authenticated_write" ON public."WritingStyleSample";

ALTER TABLE public."Subscription" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Subscription_authenticated_select" ON public."Subscription";
CREATE POLICY "Subscription_authenticated_select"
  ON public."Subscription"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_workspace_member("workspaceId") OR "userId" = yt_app.current_app_user_id() OR yt_app.is_admin());

ALTER TABLE public."CreditTransaction" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CreditTransaction_authenticated_select" ON public."CreditTransaction";
CREATE POLICY "CreditTransaction_authenticated_select"
  ON public."CreditTransaction"
  FOR SELECT
  TO authenticated
  USING (
    "userId" = yt_app.current_app_user_id()
    OR ("workspaceId" IS NOT NULL AND yt_app.is_workspace_member("workspaceId"))
    OR yt_app.is_admin()
  );

ALTER TABLE public."TrackedChannel" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "TrackedChannel_authenticated_select" ON public."TrackedChannel";
CREATE POLICY "TrackedChannel_authenticated_select"
  ON public."TrackedChannel"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_workspace_member("workspaceId") OR yt_app.is_admin());

DROP POLICY IF EXISTS "TrackedChannel_authenticated_write" ON public."TrackedChannel";

ALTER TABLE public."CompetitorRecommendation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CompetitorRecommendation_authenticated_select" ON public."CompetitorRecommendation";
CREATE POLICY "CompetitorRecommendation_authenticated_select"
  ON public."CompetitorRecommendation"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_workspace_member("workspaceId") OR yt_app.is_admin());

DROP POLICY IF EXISTS "CompetitorRecommendation_authenticated_write" ON public."CompetitorRecommendation";

ALTER TABLE public."WorkspaceVideoOpportunityScore" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "WorkspaceVideoOpportunityScore_authenticated_select" ON public."WorkspaceVideoOpportunityScore";
CREATE POLICY "WorkspaceVideoOpportunityScore_authenticated_select"
  ON public."WorkspaceVideoOpportunityScore"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_workspace_member("workspaceId") OR yt_app.is_admin());

ALTER TABLE public."CompetitorBlueprint" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CompetitorBlueprint_authenticated_select" ON public."CompetitorBlueprint";
CREATE POLICY "CompetitorBlueprint_authenticated_select"
  ON public."CompetitorBlueprint"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_workspace_member("workspaceId") OR yt_app.is_admin());

ALTER TABLE public."IndustrySource" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "IndustrySource_authenticated_select" ON public."IndustrySource";
CREATE POLICY "IndustrySource_authenticated_select"
  ON public."IndustrySource"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_workspace_member("workspaceId") OR yt_app.is_admin());

DROP POLICY IF EXISTS "IndustrySource_authenticated_write" ON public."IndustrySource";

ALTER TABLE public."IndustrySourceItem" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "IndustrySourceItem_authenticated_select" ON public."IndustrySourceItem";
CREATE POLICY "IndustrySourceItem_authenticated_select"
  ON public."IndustrySourceItem"
  FOR SELECT
  TO authenticated
  USING (yt_app.can_access_source("sourceId") OR yt_app.is_admin());

ALTER TABLE public."TopicRecommendation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "TopicRecommendation_authenticated_select" ON public."TopicRecommendation";
CREATE POLICY "TopicRecommendation_authenticated_select"
  ON public."TopicRecommendation"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_workspace_member("workspaceId") OR yt_app.is_admin());

DROP POLICY IF EXISTS "TopicRecommendation_authenticated_write" ON public."TopicRecommendation";

ALTER TABLE public."TopicRecommendationEvidence" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "TopicRecommendationEvidence_authenticated_select" ON public."TopicRecommendationEvidence";
CREATE POLICY "TopicRecommendationEvidence_authenticated_select"
  ON public."TopicRecommendationEvidence"
  FOR SELECT
  TO authenticated
  USING (yt_app.can_access_recommendation("recommendationId") OR yt_app.is_admin());

ALTER TABLE public."ResearchReport" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ResearchReport_authenticated_select" ON public."ResearchReport";
CREATE POLICY "ResearchReport_authenticated_select"
  ON public."ResearchReport"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_workspace_member("workspaceId") OR yt_app.is_admin());

DROP POLICY IF EXISTS "ResearchReport_authenticated_write" ON public."ResearchReport";

ALTER TABLE public."ContentItem" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ContentItem_authenticated_select" ON public."ContentItem";
CREATE POLICY "ContentItem_authenticated_select"
  ON public."ContentItem"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_workspace_member("workspaceId") OR yt_app.is_admin());

DROP POLICY IF EXISTS "ContentItem_authenticated_write" ON public."ContentItem";

ALTER TABLE public."ContentAsset" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ContentAsset_authenticated_select" ON public."ContentAsset";
CREATE POLICY "ContentAsset_authenticated_select"
  ON public."ContentAsset"
  FOR SELECT
  TO authenticated
  USING (yt_app.can_access_content_item("contentItemId") OR yt_app.is_admin());

DROP POLICY IF EXISTS "ContentAsset_authenticated_write" ON public."ContentAsset";

ALTER TABLE public."VisualAsset" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "VisualAsset_authenticated_select" ON public."VisualAsset";
CREATE POLICY "VisualAsset_authenticated_select"
  ON public."VisualAsset"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_workspace_member("workspaceId") OR yt_app.is_admin());

DROP POLICY IF EXISTS "VisualAsset_authenticated_write" ON public."VisualAsset";

ALTER TABLE public."AiGeneration" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AiGeneration_authenticated_select" ON public."AiGeneration";
CREATE POLICY "AiGeneration_authenticated_select"
  ON public."AiGeneration"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_workspace_member("workspaceId") OR "userId" = yt_app.current_app_user_id() OR yt_app.is_admin());

ALTER TABLE public."JobRun" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "JobRun_authenticated_select" ON public."JobRun";
CREATE POLICY "JobRun_authenticated_select"
  ON public."JobRun"
  FOR SELECT
  TO authenticated
  USING (("workspaceId" IS NOT NULL AND yt_app.is_workspace_member("workspaceId")) OR yt_app.is_admin());

ALTER TABLE public."ExportFile" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ExportFile_authenticated_select" ON public."ExportFile";
CREATE POLICY "ExportFile_authenticated_select"
  ON public."ExportFile"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_workspace_member("workspaceId") OR yt_app.is_admin());

ALTER TABLE public."EmailLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "EmailLog_authenticated_select" ON public."EmailLog";
CREATE POLICY "EmailLog_authenticated_select"
  ON public."EmailLog"
  FOR SELECT
  TO authenticated
  USING (("workspaceId" IS NOT NULL AND yt_app.is_workspace_member("workspaceId")) OR yt_app.is_admin());

ALTER TABLE public."YoutubeChannel" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "YoutubeChannel_authenticated_select" ON public."YoutubeChannel";
CREATE POLICY "YoutubeChannel_authenticated_select"
  ON public."YoutubeChannel"
  FOR SELECT
  TO authenticated
  USING (
    yt_app.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public."TrackedChannel" tc
      WHERE tc."youtubeChannelId" = "YoutubeChannel"."id"
        AND yt_app.is_workspace_member(tc."workspaceId")
    )
  );

ALTER TABLE public."YoutubeVideo" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "YoutubeVideo_authenticated_select" ON public."YoutubeVideo";
CREATE POLICY "YoutubeVideo_authenticated_select"
  ON public."YoutubeVideo"
  FOR SELECT
  TO authenticated
  USING (yt_app.can_access_youtube_video("id") OR yt_app.is_admin());

ALTER TABLE public."VideoMetricSnapshot" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "VideoMetricSnapshot_authenticated_select" ON public."VideoMetricSnapshot";
CREATE POLICY "VideoMetricSnapshot_authenticated_select"
  ON public."VideoMetricSnapshot"
  FOR SELECT
  TO authenticated
  USING (yt_app.can_access_youtube_video("youtubeVideoId") OR yt_app.is_admin());

ALTER TABLE public."VideoTranscript" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "VideoTranscript_authenticated_select" ON public."VideoTranscript";
CREATE POLICY "VideoTranscript_authenticated_select"
  ON public."VideoTranscript"
  FOR SELECT
  TO authenticated
  USING (yt_app.can_access_youtube_video("youtubeVideoId") OR yt_app.is_admin());

ALTER TABLE public."VideoAnalysis" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "VideoAnalysis_authenticated_select" ON public."VideoAnalysis";
CREATE POLICY "VideoAnalysis_authenticated_select"
  ON public."VideoAnalysis"
  FOR SELECT
  TO authenticated
  USING (yt_app.can_access_youtube_video("youtubeVideoId") OR yt_app.is_admin());

ALTER TABLE public."OutlierScore" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "OutlierScore_authenticated_select" ON public."OutlierScore";
CREATE POLICY "OutlierScore_authenticated_select"
  ON public."OutlierScore"
  FOR SELECT
  TO authenticated
  USING (yt_app.can_access_youtube_video("youtubeVideoId") OR yt_app.is_admin());

ALTER TABLE public."PlanLimit" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PlanLimit_admin_select" ON public."PlanLimit";
CREATE POLICY "PlanLimit_admin_select"
  ON public."PlanLimit"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_admin());

DROP POLICY IF EXISTS "PlanLimit_admin_write" ON public."PlanLimit";

ALTER TABLE public."AiTaskRouteOverride" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AiTaskRouteOverride_admin_select" ON public."AiTaskRouteOverride";
CREATE POLICY "AiTaskRouteOverride_admin_select"
  ON public."AiTaskRouteOverride"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_admin());

DROP POLICY IF EXISTS "AiTaskRouteOverride_admin_write" ON public."AiTaskRouteOverride";

ALTER TABLE public."AdminAuditLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AdminAuditLog_admin_select" ON public."AdminAuditLog";
CREATE POLICY "AdminAuditLog_admin_select"
  ON public."AdminAuditLog"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_admin());

DROP POLICY IF EXISTS "AdminAuditLog_admin_write" ON public."AdminAuditLog";

ALTER TABLE public."YoutubeQuotaUsage" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "YoutubeQuotaUsage_admin_select" ON public."YoutubeQuotaUsage";
CREATE POLICY "YoutubeQuotaUsage_admin_select"
  ON public."YoutubeQuotaUsage"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_admin());

DROP POLICY IF EXISTS "YoutubeQuotaUsage_admin_write" ON public."YoutubeQuotaUsage";

GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "workspace_assets_select" ON storage.objects';
    EXECUTE 'CREATE POLICY "workspace_assets_select"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id IN (''workspace-assets'', ''report-exports'', ''visual-assets'')
        AND (storage.foldername(name))[1] = ''workspaces''
        AND yt_app.is_workspace_member((storage.foldername(name))[2])
      )';

    EXECUTE 'DROP POLICY IF EXISTS "workspace_assets_insert" ON storage.objects';
    EXECUTE 'CREATE POLICY "workspace_assets_insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id IN (''workspace-assets'', ''report-exports'', ''visual-assets'')
        AND (storage.foldername(name))[1] = ''workspaces''
        AND yt_app.is_workspace_member((storage.foldername(name))[2])
      )';

    EXECUTE 'DROP POLICY IF EXISTS "workspace_assets_update" ON storage.objects';
    EXECUTE 'CREATE POLICY "workspace_assets_update"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id IN (''workspace-assets'', ''report-exports'', ''visual-assets'')
        AND (storage.foldername(name))[1] = ''workspaces''
        AND yt_app.is_workspace_member((storage.foldername(name))[2])
      )
      WITH CHECK (
        bucket_id IN (''workspace-assets'', ''report-exports'', ''visual-assets'')
        AND (storage.foldername(name))[1] = ''workspaces''
        AND yt_app.is_workspace_member((storage.foldername(name))[2])
      )';
  END IF;
END $$;
