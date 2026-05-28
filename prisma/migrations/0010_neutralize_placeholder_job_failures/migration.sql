UPDATE "JobRun"
SET
  "status" = 'CANCELED',
  "errorMessage" = NULL,
  "providerError" = NULL,
  "completedAt" = COALESCE("completedAt", now()),
  "metadata" = COALESCE("metadata", '{}'::jsonb) || jsonb_build_object(
    'neutralStatus', 'NOT_IMPLEMENTED',
    'neutralReason', 'Placeholder job type is not implemented yet.'
  )
WHERE
  "status" = 'FAILED'
  AND "jobType" IN (
    'daily_report_generate',
    'manual_report_generate',
    'export_generate',
    'provider_cost_snapshot'
  )
  AND "errorMessage" LIKE '%not implemented in this spec%';
