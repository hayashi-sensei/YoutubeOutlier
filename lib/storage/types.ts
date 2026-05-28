export type StoragePutObjectInput = {
  key: string;
  body: Buffer;
  contentType?: string;
  cacheControl?: string;
};

export type StorageGetObjectResult = {
  key: string;
  body: Buffer;
  contentType: string | null;
};

export type StorageAdapter = {
  putObject(input: StoragePutObjectInput): Promise<{ key: string; publicUrl: string | null }>;
  getObject(input: { key: string }): Promise<StorageGetObjectResult>;
  deleteObject(input: { key: string }): Promise<void>;
  createSignedReadUrl(input: { key: string; expiresInSeconds: number }): Promise<string>;
  getPublicUrl(key: string): string | null;
};
