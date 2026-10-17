/**
 * 限流（RPM / TPM / 并发）
 *  - 热路径使用 KV 计数器（秒级窗口）；KV 为最终一致，精确并发/突发控制建议升级 Durable Objects
 *  - TPM 在响应后回填实际 token 数，下一窗口生效；超出返回结构化 429
 *  - 重放保护 nonce 也复用 KV
 */
import type { MinimalEnv } from "./types";
import { sha256Hex } from "./crypto";

const MINUTE = 60;

function windowKey(subject: string, kind: "rpm" | "tpm", ts: number): string {
  const epochMinute = Math.floor(ts / MINUTE);
  return `rl:${kind}:${subject}:${epochMinute}`;
}

async function incrKV(kv: KVNamespace, key: string, delta: number, ttlSeconds: number): Promise<number> {
  const cur = parseInt((await kv.get(key)) ?? "0", 10);
  const next = cur + delta;
  await kv.put(key, String(next), { expirationTtl: ttlSeconds });
  return next;
}

export type LimitResult = { ok: boolean; retryAfter: number; kind?: "rpm" | "tpm" | "concurrency" };

export async function checkRateLimit(
  env: MinimalEnv,
  keyId: string,
  limits: { rpm: number; tpm: number; concurrency: number }
): Promise<LimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const rpm = await incrKV(env.KV, windowKey(keyId, "rpm", now), 1, MINUTE * 2);
  if (rpm > limits.rpm) return { ok: false, retryAfter: MINUTE - (now % MINUTE) + 1, kind: "rpm" };

  // 并发：近似计数，进入时 +1，结束时 -1（TTL 60s 自动清理崩溃残留）
  const concKey = `rl:conc:${keyId}:${Math.floor(now / 30)}`;
  const conc = await incrKV(env.KV, concKey, 1, 60);
  if (conc > limits.concurrency) {
    return { ok: false, retryAfter: 5, kind: "concurrency" };
  }
  return { ok: true, retryAfter: 0 };
}

export async function reportTokenUsage(env: MinimalEnv, keyId: string, tokens: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await incrKV(env.KV, windowKey(keyId, "tpm", now), tokens, MINUTE * 2);
}

export async function checkTpmBeforeRequest(env: MinimalEnv, keyId: string, limits: { tpm: number }): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const used = parseInt((await env.KV.get(windowKey(keyId, "tpm", now))) ?? "0", 10);
  return used <= limits.tpm;
}

/** 请求结束时释放并发计数 */
export async function releaseConcurrency(env: MinimalEnv, keyId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const key = `rl:conc:${keyId}:${Math.floor(now / 30)}`;
  const cur = parseInt((await env.KV.get(key)) ?? "0", 10);
  if (cur > 0) await env.KV.put(key, String(cur - 1), { expirationTtl: 60 });
}

/** 签名 nonce 去重（防重放）：5 分钟内同一签名只允许一次 */
export async function claimSignatureNonce(env: MinimalEnv, sigHash: string, ts: string): Promise<boolean> {
  const key = `nonce:${sigHash}:${ts}`;
  const existing = await env.KV.get(key);
  if (existing) return false;
  await env.KV.put(key, "1", { expirationTtl: 600 });
  return true;
}

export async function sigHashOf(sig: string): Promise<string> {
  return (await sha256Hex(sig)).slice(0, 32);
}
