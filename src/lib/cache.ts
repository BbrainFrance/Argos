/**
 * Cache 3 niveaux : in-memory (serveur) → Redis → upstream.
 * Niveau 1 : Map en mémoire (par worker/instance)
 * Niveau 2 : Redis (cross-requêtes, cross-instances)
 * Niveau 3 : appel à l'upstream (fn)
 */

import { getRedis } from "./redis";

export interface CacheOptions {
  /** TTL en secondes pour Redis et mémoire */
  ttlSeconds?: number;
  /** Préfixe des clés (namespace) */
  prefix?: string;
  /** Désactiver le cache mémoire (forcer Redis ou upstream) */
  skipMemory?: boolean;
}

const DEFAULT_TTL = 60;
const DEFAULT_PREFIX = "argos";

interface MemoryEntry {
  data: string;
  expires: number;
}

const memoryCache = new Map<string, MemoryEntry>();

function memoryGet(key: string): string | null {
  const ent = memoryCache.get(key);
  if (!ent) return null;
  if (Date.now() >= ent.expires) {
    memoryCache.delete(key);
    return null;
  }
  return ent.data;
}

function memorySet(key: string, data: string, ttlSeconds: number): void {
  memoryCache.set(key, {
    data,
    expires: Date.now() + ttlSeconds * 1000,
  });
}

export async function getCached<T>(
  key: string,
  fn: () => Promise<T>,
  opts?: CacheOptions
): Promise<T> {
  const ttl = opts?.ttlSeconds ?? DEFAULT_TTL;
  const prefix = opts?.prefix ?? DEFAULT_PREFIX;
  const fullKey = `${prefix}:${key}`;

  // Niveau 1 : mémoire
  if (!opts?.skipMemory) {
    const cached = memoryGet(fullKey);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        memoryCache.delete(fullKey);
      }
    }
  }

  // Niveau 2 : Redis
  const redis = await getRedis();
  if (redis) {
    try {
      const cached = await redis.get<string>(fullKey);
      if (cached != null) {
        const parsed = typeof cached === "string" ? (JSON.parse(cached) as T) : (cached as T);
        if (!opts?.skipMemory) memorySet(fullKey, JSON.stringify(parsed), ttl);
        return parsed;
      }
    } catch {
      // Redis en erreur : continuer vers upstream
    }
  }

  // Niveau 3 : upstream
  const result = await fn();

  // Backfill mémoire + Redis
  const serialized = JSON.stringify(result);
  if (!opts?.skipMemory) memorySet(fullKey, serialized, ttl);
  if (redis) {
    redis.setex(fullKey, ttl, serialized).catch(() => {});
  }

  return result;
}
