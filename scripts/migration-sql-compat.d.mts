export type DatabaseCapabilities = {
  roles: Set<string>;
  hasAuthUid: boolean;
};

export function loadDatabaseCapabilities(client: {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}): Promise<DatabaseCapabilities>;

export function ensureAuthUidShim(
  client: {
    query: (sql: string, values?: unknown[]) => Promise<unknown>;
  },
  capabilities: DatabaseCapabilities,
): Promise<void>;

export function adaptMigrationSqlForCapabilities(sql: string, capabilities: DatabaseCapabilities): string;
