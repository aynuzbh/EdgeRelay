/**
 * 密码学工具（WebCrypto，Workers 兼容）
 *  - API Key：明文只在创建响应中出现一次，库中仅存 SHA-256
 *  - 上游密钥：AES-256-GCM 加密存储，主密钥来自 ENCRYPTION_KEY secret
 */
import type { Env } from "./types";

const enc = new TextEncoder();
const dec = new TextDecoder();

export function uuid(): string {
  return crypto.randomUUID();
}

export function sha256Hex(data: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", enc.encode(data))
    .then((b) => bufToHex(b));
}

function bufToHex(b: ArrayBuffer): string {
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function hmacHex(secret: string, msg: string): Promise<string> {
  const k = await hmacKey(secret);
  return bufToHex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

export async function timingSafeEqualHex(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}

/** PBKDF2-SHA256 口令哈希：pbkdf2$<iter>$<saltHex>$<hashHex> */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iter = 100_000;
  const hash = await pbkdf2(password, salt, iter);
  return `pbkdf2$${iter}$${bufToHex(salt.buffer)}$${bufToHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterStr, saltHex, hashHex] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterStr || !saltHex || !hashHex) return false;
  const salt = hexToBuf(saltHex);
  const hash = await pbkdf2(password, salt, parseInt(iterStr, 10));
  return timingSafeEqualHex(bufToHex(hash), hashHex);
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256
  );
}

function hexToBuf(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/* ---------- AES-256-GCM（上游供应商密钥加密） ---------- */

async function aesKey(env: Env): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", enc.encode(env.ENCRYPTION_KEY));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(env: Env, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(env);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(plaintext)
  );
  return `v1:${bufToHex(iv.buffer)}:${bufToHex(ct)}`;
}

export async function decryptSecret(env: Env, blob: string): Promise<string> {
  const [version, ivHex, ctHex] = blob.split(":");
  if (version !== "v1") throw new Error("unsupported ciphertext version");
  const key = await aesKey(env);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBuf(ivHex) as BufferSource },
    key,
    hexToBuf(ctHex) as BufferSource
  );
  return dec.decode(pt);
}

/* ---------- 平台 API Key 生成 ---------- */

export function generateApiKey(): { plaintext: string; prefix: string; hashPromise: Promise<string> } {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const body = base64url(bytes);
  const plaintext = `sk-gw-${body}`;
  return { plaintext, prefix: plaintext.slice(0, 12), hashPromise: sha256Hex(plaintext) };
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
