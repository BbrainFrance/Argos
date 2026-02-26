import { getRedis } from "./redis";

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "VIEW_ENTITY"
  | "TRACK_ENTITY"
  | "FLAG_ENTITY"
  | "CREATE_ZONE"
  | "DELETE_ZONE"
  | "PLACE_MARKER"
  | "DELETE_MARKER"
  | "CREATE_LINK"
  | "DELETE_LINK"
  | "CREATE_MISSION"
  | "EXPORT_PDF"
  | "GENERATE_BRIEFING"
  | "AI_QUERY"
  | "CHANGE_CLASSIFICATION"
  | "ENCRYPT_DATA"
  | "DECRYPT_DATA"
  | "ACTIVATE_LAYER"
  | "DEACTIVATE_LAYER"
  | "ACKNOWLEDGE_ALERT"
  | "FILTER_CHANGE"
  | "MAP_INTERACTION"
  | "TACTICAL_MESSAGE"
  | "CONFIG_CHANGE";

export type AuditSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  action: AuditAction;
  severity: AuditSeverity;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  success: boolean;
  errorMessage?: string;
}

const REDIS_KEY_PREFIX = "argos:audit:";
const REDIS_LIST_KEY = "argos:audit:log";
const MAX_MEMORY_ENTRIES = 5000;
const MAX_REDIS_ENTRIES = 50000;

const memoryLog: AuditEntry[] = [];

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `aud_${ts}_${rand}`;
}

function classifySeverity(action: AuditAction): AuditSeverity {
  const critical: AuditAction[] = [
    "CHANGE_CLASSIFICATION",
    "ENCRYPT_DATA",
    "DECRYPT_DATA",
    "CONFIG_CHANGE",
    "DELETE_ZONE",
    "DELETE_MARKER",
    "DELETE_LINK",
    "EXPORT_PDF",
  ];
  const warning: AuditAction[] = [
    "LOGIN",
    "LOGOUT",
    "FLAG_ENTITY",
    "CREATE_ZONE",
    "PLACE_MARKER",
    "CREATE_LINK",
    "CREATE_MISSION",
    "GENERATE_BRIEFING",
  ];

  if (critical.includes(action)) return "CRITICAL";
  if (warning.includes(action)) return "WARNING";
  return "INFO";
}

export async function logAudit(
  params: Omit<AuditEntry, "id" | "timestamp" | "severity">
): Promise<AuditEntry> {
  const entry: AuditEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    severity: classifySeverity(params.action),
    ...params,
  };

  memoryLog.unshift(entry);
  if (memoryLog.length > MAX_MEMORY_ENTRIES) {
    memoryLog.length = MAX_MEMORY_ENTRIES;
  }

  try {
    const redis = await getRedis();
    if (redis) {
      await redis.lpush(REDIS_LIST_KEY, JSON.stringify(entry));
      await redis.ltrim(REDIS_LIST_KEY, 0, MAX_REDIS_ENTRIES - 1);
      await redis.set(`${REDIS_KEY_PREFIX}${entry.id}`, JSON.stringify(entry), { ex: 90 * 24 * 3600 });
    }
  } catch {
    // Redis unavailable — in-memory is sufficient
  }

  return entry;
}

export interface AuditQuery {
  userId?: string;
  action?: AuditAction;
  severity?: AuditSeverity;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function queryAuditLog(query: AuditQuery = {}): Promise<{ entries: AuditEntry[]; total: number }> {
  const limit = Math.min(query.limit ?? 100, 500);
  const offset = query.offset ?? 0;

  let entries: AuditEntry[];

  try {
    const redis = await getRedis();
    if (redis) {
      const raw = await redis.lrange(REDIS_LIST_KEY, 0, MAX_REDIS_ENTRIES - 1);
      entries = raw
        .map((r) => {
          try { return JSON.parse(r as string) as AuditEntry; }
          catch { return null; }
        })
        .filter((e): e is AuditEntry => e !== null);
    } else {
      entries = [...memoryLog];
    }
  } catch {
    entries = [...memoryLog];
  }

  if (query.userId) entries = entries.filter((e) => e.userId === query.userId);
  if (query.action) entries = entries.filter((e) => e.action === query.action);
  if (query.severity) entries = entries.filter((e) => e.severity === query.severity);
  if (query.from) {
    const from = new Date(query.from).getTime();
    entries = entries.filter((e) => new Date(e.timestamp).getTime() >= from);
  }
  if (query.to) {
    const to = new Date(query.to).getTime();
    entries = entries.filter((e) => new Date(e.timestamp).getTime() <= to);
  }

  const total = entries.length;
  const paginated = entries.slice(offset, offset + limit);

  return { entries: paginated, total };
}

export function getRecentAuditFromMemory(count = 50): AuditEntry[] {
  return memoryLog.slice(0, count);
}
