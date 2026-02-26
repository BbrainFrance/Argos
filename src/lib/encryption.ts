/**
 * Chiffrement AES-256-GCM pour donnees operationnelles au repos.
 *
 * Utilise l'API Web Crypto (disponible dans Node.js et navigateurs modernes).
 * La cle maitre est derivee de ARGOS_ENCRYPTION_KEY via PBKDF2.
 *
 * Format du payload chiffre : base64(iv:tag:ciphertext)
 *   - iv  : 12 octets (nonce)
 *   - tag : inclus dans le ciphertext par GCM
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 310_000;
const SALT = "ARGOS-SOVEREIGN-SALT-v1";

let _derivedKey: CryptoKey | null = null;

function getEnvKey(): string {
  const key = process.env.ARGOS_ENCRYPTION_KEY;
  if (!key || key.length < 16) {
    throw new Error(
      "ARGOS_ENCRYPTION_KEY non configuree ou trop courte (min 16 caracteres)"
    );
  }
  return key;
}

async function deriveKey(): Promise<CryptoKey> {
  if (_derivedKey) return _derivedKey;

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(getEnvKey()),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  _derivedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );

  return _derivedKey;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveKey();
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    enc.encode(plaintext)
  );

  const combined = new Uint8Array(iv.length + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.length);

  return toBase64(combined.buffer);
}

export async function decrypt(payload: string): Promise<string> {
  const key = await deriveKey();
  const combined = fromBase64(payload);

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plainBuffer);
}

export async function encryptJSON<T>(data: T): Promise<string> {
  return encrypt(JSON.stringify(data));
}

export async function decryptJSON<T>(payload: string): Promise<T> {
  const json = await decrypt(payload);
  return JSON.parse(json) as T;
}

export function isEncryptionConfigured(): boolean {
  const key = process.env.ARGOS_ENCRYPTION_KEY;
  return !!key && key.length >= 16;
}

export function resetDerivedKey(): void {
  _derivedKey = null;
}
