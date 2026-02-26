/**
 * Client Redis Upstash pour cache cross-requêtes.
 * Désactivé si UPSTASH_REDIS_REST_URL ou UPSTASH_REDIS_REST_TOKEN sont absents.
 */
let _redis: import("@upstash/redis").Redis | null = null;

export async function getRedis(): Promise<import("@upstash/redis").Redis | null> {
  if (_redis != null) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = await import("@upstash/redis");
    _redis = new Redis({ url, token });
    return _redis;
  } catch {
    return null;
  }
}

export function isRedisAvailable(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
