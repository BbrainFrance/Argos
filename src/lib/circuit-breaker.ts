/**
 * Circuit breaker pour protéger les appels aux APIs externes.
 * État : CLOSED (ok) → OPEN (échec répété) → HALF_OPEN (retest).
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerOptions {
  /** Nombre d'échecs consécutifs pour ouvrir le circuit */
  failureThreshold?: number;
  /** Durée (ms) avant de tenter un retest en HALF_OPEN */
  resetTimeout?: number;
  /** Préfixe des clés en mémoire (pour isoler les circuits) */
  name?: string;
}

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  resetTimeout: 30_000,
  name: "default",
};

interface CircuitStore {
  failures: number;
  lastFailure: number;
  state: CircuitState;
  lastSuccess: number;
}

const g = globalThis as unknown as { __circuitBreakers?: Map<string, CircuitStore> };

function getStore(name: string): CircuitStore {
  if (!g.__circuitBreakers) g.__circuitBreakers = new Map();
  let s = g.__circuitBreakers.get(name);
  if (!s) {
    s = { failures: 0, lastFailure: 0, state: "CLOSED", lastSuccess: 0 };
    g.__circuitBreakers.set(name, s);
  }
  return s;
}

export function getCircuitState(name: string): CircuitState {
  const s = getStore(name);
  const now = Date.now();
  if (s.state === "OPEN" && now - s.lastFailure >= (DEFAULT_OPTIONS.resetTimeout || 30_000)) {
    s.state = "HALF_OPEN";
  }
  return s.state;
}

export function recordSuccess(name: string): void {
  const s = getStore(name);
  s.failures = 0;
  s.state = "CLOSED";
  s.lastSuccess = Date.now();
}

export function recordFailure(name: string, opts?: CircuitBreakerOptions): void {
  const opt = { ...DEFAULT_OPTIONS, ...opts };
  const key = `${opt.name}:${name}`;
  const s = getStore(key);
  s.failures += 1;
  s.lastFailure = Date.now();
  if (s.failures >= opt.failureThreshold) {
    s.state = "OPEN";
  }
}

/**
 * Exécute fn() si le circuit est fermé ou en half-open.
 * En OPEN, lance immédiatement une erreur sans appeler fn.
 */
export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  opts?: CircuitBreakerOptions
): Promise<T> {
  const opt = { ...DEFAULT_OPTIONS, ...opts };
  const key = `${opt.name}:${name}`;
  const state = getCircuitState(key);

  if (state === "OPEN") {
    throw new Error(`Circuit breaker OPEN for ${name} — upstream unavailable`);
  }

  try {
    const result = await fn();
    recordSuccess(key);
    return result;
  } catch (err) {
    recordFailure(key, opt);
    throw err;
  }
}
