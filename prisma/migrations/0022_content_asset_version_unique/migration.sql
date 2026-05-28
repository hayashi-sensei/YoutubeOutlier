CREATE UNIQUE INDEX "ContentAsset_contentItemId_assetType_version_key"
  ON "ContentAsset"("contentItemId", "assetType", "version");
