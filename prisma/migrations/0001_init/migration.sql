-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'PAUSED');

-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('FREE', 'STARTER', 'PRO', 'PREMIUM');

-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('MONTHLY_REFILL', 'PURCHASE', 'USAGE', 'ADMIN_ADJUSTMENT', 'REFUND', 'EXPIRATION');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'RETRYING');

-- CreateEnum
CREATE TYPE "TranscriptStatus" AS ENUM ('NOT_REQUESTED', 'QUEUED', 'AVAILABLE', 'UNAVAILABLE', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('QUEUED', 'GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('IDEA', 'OUTLINE', 'SCRIPT', 'THUMBNAIL', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "VisualAssetType" AS ENUM ('YOUTUBE_THUMBNAIL', 'LINKEDIN_IMAGE', 'LINKEDIN_CAROUSEL_COVER', 'QUOTE_CARD', 'DIAGRAM');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('NEW', 'SAVED', 'DISMISSED', 'USED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('WEBSITE', 'RSS', 'BLOG', 'NEWSLETTER', 'BRAND_PAGE', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "defaultWorkspaceId" TEXT,
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "planCode" "PlanCode" NOT NULL DEFAULT 'FREE',
    "creditBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "primaryNiche" TEXT NOT NULL,
    "subNiche" TEXT,
    "targetAudience" TEXT,
    "contentGoals" TEXT,
    "brandVoice" TEXT,
    "cta" TEXT,
    "offers" TEXT,
    "topicsToAvoid" TEXT,
    "defaultAiQualityTier" TEXT NOT NULL DEFAULT 'standard',
    "dailyReportEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reportDeliveryEmail" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Singapore',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingStyleSample" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "title" TEXT,
    "sampleText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WritingStyleSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planCode" "PlanCode" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "CreditTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "description" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YoutubeChannel" (
    "id" TEXT NOT NULL,
    "youtubeChannelId" TEXT NOT NULL,
    "handle" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "subscriberCount" BIGINT,
    "videoCount" INTEGER,
    "viewCount" BIGINT,
    "uploadsPlaylistId" TEXT,
    "country" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YoutubeChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedChannel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "youtubeChannelId" TEXT NOT NULL,
    "nickname" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "addedByRecommendation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorRecommendation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "youtubeChannelId" TEXT,
    "channelUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YoutubeVideo" (
    "id" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "youtubeChannelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER,
    "thumbnailUrl" TEXT,
    "tags" TEXT[],
    "categoryId" TEXT,
    "defaultLanguage" TEXT,
    "transcriptStatus" "TranscriptStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YoutubeVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoMetricSnapshot" (
    "id" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "viewCount" BIGINT,
    "likeCount" BIGINT,
    "commentCount" BIGINT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoTranscript" (
    "id" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "provider" TEXT,
    "language" TEXT,
    "text" TEXT,
    "segmentsJson" JSONB,
    "fetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAnalysis" (
    "id" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "analysisType" TEXT NOT NULL,
    "contentPillar" TEXT,
    "hookType" TEXT,
    "titlePattern" TEXT,
    "thumbnailPattern" TEXT,
    "structureJson" JSONB,
    "summary" TEXT,
    "ctaPattern" TEXT,
    "emotionalAngle" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutlierScore" (
    "id" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "channelBaselineViews" DOUBLE PRECISION,
    "relativeViewPerformance" DOUBLE PRECISION,
    "viewVelocityScore" DOUBLE PRECISION,
    "engagementScore" DOUBLE PRECISION,
    "recencyScore" DOUBLE PRECISION,
    "repeatSignalScore" DOUBLE PRECISION,
    "outlierScore" DOUBLE PRECISION NOT NULL,
    "multiplier" DOUBLE PRECISION,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutlierScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustrySource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'WEBSITE',
    "rssUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndustrySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustrySourceItem" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "summary" TEXT,
    "contentText" TEXT,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT,

    CONSTRAINT "IndustrySourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicRecommendation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reportId" TEXT,
    "title" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "angle" TEXT,
    "whyNow" TEXT,
    "audiencePainPoint" TEXT,
    "opportunityScore" DOUBLE PRECISION,
    "suggestedHook" TEXT,
    "suggestedTitle" TEXT,
    "thumbnailConcept" TEXT,
    "outlineJson" JSONB,
    "linkedinAngle" TEXT,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicRecommendationEvidence" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "youtubeVideoId" TEXT,
    "sourceItemId" TEXT,
    "evidenceType" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicRecommendationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchReport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'QUEUED',
    "reportDate" TIMESTAMP(3) NOT NULL,
    "manualRun" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT,
    "sectionsJson" JSONB,
    "errorMessage" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "title" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'IDEA',
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAsset" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "jsonBody" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualAsset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contentItemId" TEXT,
    "assetType" "VisualAssetType" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "prompt" TEXT NOT NULL,
    "imageUrl" TEXT,
    "storagePath" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "costUsd" DECIMAL(10,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisualAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiGeneration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "taskType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AiGenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "promptHash" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DECIMAL(10,4),
    "creditsCharged" INTEGER NOT NULL DEFAULT 0,
    "requestJson" JSONB,
    "responseJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "jobType" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportFile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reportId" TEXT,
    "fileType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "downloadUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "toEmail" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "providerId" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSettings_workspaceId_key" ON "WorkspaceSettings"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_workspaceId_idx" ON "Subscription"("workspaceId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "CreditTransaction_workspaceId_createdAt_idx" ON "CreditTransaction"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditTransaction_referenceType_referenceId_idx" ON "CreditTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "YoutubeChannel_youtubeChannelId_key" ON "YoutubeChannel"("youtubeChannelId");

-- CreateIndex
CREATE INDEX "YoutubeChannel_handle_idx" ON "YoutubeChannel"("handle");

-- CreateIndex
CREATE INDEX "YoutubeChannel_lastFetchedAt_idx" ON "YoutubeChannel"("lastFetchedAt");

-- CreateIndex
CREATE INDEX "TrackedChannel_workspaceId_isActive_idx" ON "TrackedChannel"("workspaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedChannel_workspaceId_youtubeChannelId_key" ON "TrackedChannel"("workspaceId", "youtubeChannelId");

-- CreateIndex
CREATE INDEX "CompetitorRecommendation_workspaceId_status_idx" ON "CompetitorRecommendation"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "YoutubeVideo_youtubeVideoId_key" ON "YoutubeVideo"("youtubeVideoId");

-- CreateIndex
CREATE INDEX "YoutubeVideo_youtubeChannelId_publishedAt_idx" ON "YoutubeVideo"("youtubeChannelId", "publishedAt");

-- CreateIndex
CREATE INDEX "YoutubeVideo_publishedAt_idx" ON "YoutubeVideo"("publishedAt");

-- CreateIndex
CREATE INDEX "YoutubeVideo_lastFetchedAt_idx" ON "YoutubeVideo"("lastFetchedAt");

-- CreateIndex
CREATE INDEX "VideoMetricSnapshot_youtubeVideoId_capturedAt_idx" ON "VideoMetricSnapshot"("youtubeVideoId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VideoTranscript_youtubeVideoId_key" ON "VideoTranscript"("youtubeVideoId");

-- CreateIndex
CREATE INDEX "VideoAnalysis_youtubeVideoId_analysisType_idx" ON "VideoAnalysis"("youtubeVideoId", "analysisType");

-- CreateIndex
CREATE INDEX "OutlierScore_youtubeVideoId_calculatedAt_idx" ON "OutlierScore"("youtubeVideoId", "calculatedAt");

-- CreateIndex
CREATE INDEX "OutlierScore_outlierScore_idx" ON "OutlierScore"("outlierScore");

-- CreateIndex
CREATE INDEX "IndustrySource_workspaceId_isActive_idx" ON "IndustrySource"("workspaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "IndustrySource_workspaceId_url_key" ON "IndustrySource"("workspaceId", "url");

-- CreateIndex
CREATE INDEX "IndustrySourceItem_sourceId_publishedAt_idx" ON "IndustrySourceItem"("sourceId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IndustrySourceItem_sourceId_url_key" ON "IndustrySourceItem"("sourceId", "url");

-- CreateIndex
CREATE INDEX "TopicRecommendation_workspaceId_status_createdAt_idx" ON "TopicRecommendation"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TopicRecommendation_reportId_idx" ON "TopicRecommendation"("reportId");

-- CreateIndex
CREATE INDEX "TopicRecommendationEvidence_recommendationId_idx" ON "TopicRecommendationEvidence"("recommendationId");

-- CreateIndex
CREATE INDEX "ResearchReport_workspaceId_reportDate_idx" ON "ResearchReport"("workspaceId", "reportDate");

-- CreateIndex
CREATE INDEX "ResearchReport_workspaceId_status_idx" ON "ResearchReport"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ContentItem_workspaceId_status_idx" ON "ContentItem"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ContentItem_workspaceId_scheduledFor_idx" ON "ContentItem"("workspaceId", "scheduledFor");

-- CreateIndex
CREATE INDEX "ContentAsset_contentItemId_assetType_idx" ON "ContentAsset"("contentItemId", "assetType");

-- CreateIndex
CREATE INDEX "VisualAsset_workspaceId_createdAt_idx" ON "VisualAsset"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "VisualAsset_contentItemId_idx" ON "VisualAsset"("contentItemId");

-- CreateIndex
CREATE INDEX "AiGeneration_workspaceId_taskType_createdAt_idx" ON "AiGeneration"("workspaceId", "taskType", "createdAt");

-- CreateIndex
CREATE INDEX "AiGeneration_status_idx" ON "AiGeneration"("status");

-- CreateIndex
CREATE INDEX "JobRun_workspaceId_status_idx" ON "JobRun"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "JobRun_jobType_status_idx" ON "JobRun"("jobType", "status");

-- CreateIndex
CREATE INDEX "JobRun_referenceType_referenceId_idx" ON "JobRun"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "ExportFile_workspaceId_createdAt_idx" ON "ExportFile"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ExportFile_reportId_idx" ON "ExportFile"("reportId");

-- CreateIndex
CREATE INDEX "EmailLog_workspaceId_createdAt_idx" ON "EmailLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorUserId_createdAt_idx" ON "AdminAuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSettings" ADD CONSTRAINT "WorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingStyleSample" ADD CONSTRAINT "WritingStyleSample_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "WorkspaceSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedChannel" ADD CONSTRAINT "TrackedChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedChannel" ADD CONSTRAINT "TrackedChannel_youtubeChannelId_fkey" FOREIGN KEY ("youtubeChannelId") REFERENCES "YoutubeChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorRecommendation" ADD CONSTRAINT "CompetitorRecommendation_youtubeChannelId_fkey" FOREIGN KEY ("youtubeChannelId") REFERENCES "YoutubeChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YoutubeVideo" ADD CONSTRAINT "YoutubeVideo_youtubeChannelId_fkey" FOREIGN KEY ("youtubeChannelId") REFERENCES "YoutubeChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoMetricSnapshot" ADD CONSTRAINT "VideoMetricSnapshot_youtubeVideoId_fkey" FOREIGN KEY ("youtubeVideoId") REFERENCES "YoutubeVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTranscript" ADD CONSTRAINT "VideoTranscript_youtubeVideoId_fkey" FOREIGN KEY ("youtubeVideoId") REFERENCES "YoutubeVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAnalysis" ADD CONSTRAINT "VideoAnalysis_youtubeVideoId_fkey" FOREIGN KEY ("youtubeVideoId") REFERENCES "YoutubeVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutlierScore" ADD CONSTRAINT "OutlierScore_youtubeVideoId_fkey" FOREIGN KEY ("youtubeVideoId") REFERENCES "YoutubeVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndustrySource" ADD CONSTRAINT "IndustrySource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndustrySourceItem" ADD CONSTRAINT "IndustrySourceItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IndustrySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicRecommendation" ADD CONSTRAINT "TopicRecommendation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicRecommendation" ADD CONSTRAINT "TopicRecommendation_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ResearchReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicRecommendationEvidence" ADD CONSTRAINT "TopicRecommendationEvidence_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "TopicRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicRecommendationEvidence" ADD CONSTRAINT "TopicRecommendationEvidence_youtubeVideoId_fkey" FOREIGN KEY ("youtubeVideoId") REFERENCES "YoutubeVideo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicRecommendationEvidence" ADD CONSTRAINT "TopicRecommendationEvidence_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "IndustrySourceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchReport" ADD CONSTRAINT "ResearchReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "TopicRecommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualAsset" ADD CONSTRAINT "VisualAsset_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportFile" ADD CONSTRAINT "ExportFile_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ResearchReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
