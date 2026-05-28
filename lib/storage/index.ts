import type { StorageAdapter } from "@/lib/storage/types";
import { getR2StorageConfig } from "@/lib/storage/config";
import { createR2StorageAdapter } from "@/lib/storage/r2-adapter";

export type {
  StorageAdapter,
  StorageGetObjectResult,
  StoragePutObjectInput,
} from "@/lib/storage/types";
export {
  assertObjectKeyHasPrefix,
  assertSafeObjectKey,
  buildReportExportObjectKey,
  buildVisualAssetObjectKey,
  objectKey,
} from "@/lib/storage/keys";
export { createMemoryStorageAdapter } from "@/lib/storage/memory-adapter";
export { getR2StorageConfig } from "@/lib/storage/config";
export { createR2Client, createR2StorageAdapter } from "@/lib/storage/r2-adapter";

let storageAdapter: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  storageAdapter ??= createR2StorageAdapter({ config: getR2StorageConfig() });
  return storageAdapter;
}
