-- Remove already-cached Shorts-style videos. Future ingestion also rejects
-- videos shorter than 90 seconds before writing YoutubeVideo rows.
DELETE FROM "YoutubeVideo"
WHERE "durationSeconds" < 90;
