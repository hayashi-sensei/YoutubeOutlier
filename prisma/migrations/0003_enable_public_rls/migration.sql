-- Enable row level security for all application tables exposed through the public schema.
-- The app currently uses server-side database access, so browser roles should not receive
-- direct Data API privileges until a feature explicitly defines scoped policies.

ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WorkspaceMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WorkspaceSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WritingStyleSample" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CreditTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."YoutubeChannel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TrackedChannel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CompetitorRecommendation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."YoutubeVideo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VideoMetricSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VideoTranscript" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VideoAnalysis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OutlierScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."IndustrySource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."IndustrySourceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TopicRecommendation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TopicRecommendationEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ResearchReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ContentItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ContentAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VisualAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AiGeneration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."JobRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ExportFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."EmailLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AdminAuditLog" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
