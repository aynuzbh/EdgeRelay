/**
 * 认证与授权
 *  - 面向浏览器/后台：Cookie 会话（HMAC 签名）+ 基于角色的访问控制
 *  - 面向 API 调用方：Bearer sk-gw-* API Key（哈希查库）+ IP 白名单 + 模型白名单 + 可选签名校验（防重放/防篡改）
 *  - 管理接口强制二次验证（step-up，10 分钟有效期）
 */
import type { HandlerCtx, MinimalReq, MinimalEnv, AuthedKey, RateLimits } from "./types";
import { ApiError, ErrorCode } from "./errors";
import { hmacHex, sha256Hex, timingSafeEqualHex } from "./crypto";
import { getSettings } from "./settings";

export type SessionUser = {
  id: string;
  email: string;
  role: "user" | "admin" | "finance" | "auditor";
  status: string;
};

/* ---------- Cookie 会话 ---------- */

function signedToken(secret: string, sid: string): Promise<string> {
  return hmacHex(secret, `sid:${sid}`).then((sig) => `${sid}.${sig}`);
}

export async function sessionCookie(resp: Response, secret: string, sid: string, maxAge = 604800): Promise<Response> {
  const token = await signedToken(secret, sid);
  const out = new Response(resp.body, resp);
  out.headers.append(
    "set-cookie",
    `gw_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
  );
  return out;
}

export function clearCookie(resp: Response): Response {
  const out = new Response(resp.body, resp);
  out.headers.append("set-cookie", "gw_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  return out;
}

export async function getSessionUser(c: HandlerCtx): Promise<SessionUser | null> {
  const cookie = c.req.header("cookie") ?? "";
  const m = cookie.match(/gw_session=([^;]+)/);
  if (!m) return null;
  const [sid, sig] = m[1]!.split(".");
  if (!sid || !sig) return null;
  const expect = await hmacHex(String(c.env.SESSION_SECRET), `sid:${sid}`);
  if (!(await timingSafeEqualHex(sig, expect))) return null;
  const now = Math.floor(Date.now() / 1000);
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.role, u.status FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.id=?1 AND s.expires_at > ?2`
  )
    .bind(sid, now)
    .first<{ id: string; email: string; role: string; status: string }>();
  if (!row || row.status !== "active") return null;
  return { ...row, role: row.role as SessionUser["role"] };
}

export async function requireUser(c: HandlerCtx): Promise<SessionUser> {
  const u = await getSessionUser(c);
  if (!u) throw new ApiError(401, ErrorCode.AUTH_REQUIRED, "未登录");
  return u;
}

export function requireRole(u: SessionUser, roles: SessionUser["role"][]): void {
  if (!roles.includes(u.role)) throw new ApiError(403, ErrorCode.FORBIDDEN, "权限不足");
}

/** 管理接口二次验证：需要已登录且通过 step-up（/api/auth/stepup，10 分钟内有效） */
export async function requireAdminStepUp(c: HandlerCtx): Promise<SessionUser> {
  const u = await requireUser(c);
  requireRole(u, ["admin"]);
  // 设置里关闭二次验证时，仅需 admin 角色
  if (await getSettings(c.env.DB).then((s) => s.stepUpDisabled)) return u;
  const now = Math.floor(Date.now() / 1000);
  const row = await c.env.DB.prepare("SELECT step_up_until FROM users WHERE id=?1")
    .bind(u.id)
    .first<{ step_up_until: number | null }>();
  if (!row?.step_up_until || row.step_up_until < now) {
    throw new ApiError(403, ErrorCode.STEP_UP_REQUIRED, "管理操作需要二次验证", {
      stepUpUrl: "/api/auth/stepup",
    });
  }
  return u;
}

/* ---------- API Key 认证 ---------- */

export async function authenticateApiKey(c: HandlerCtx): Promise<AuthedKey> {
  const auth = c.req.header("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(sk-gw-\S+)$/i);
  if (!m) throw new ApiError(401, ErrorCode.AUTH_REQUIRED, "缺少 Bearer API Key");
  const plaintext = m[1]!;
  const hash = await sha256Hex(plaintext);
  const now = Math.floor(Date.now() / 1000);
  const row = await c.env.DB.prepare(
    `SELECT id, user_id, org_id, status, expires_at, ip_whitelist, model_whitelist,
            requires_signing, quota_usd, spent_usd
     FROM api_keys WHERE key_hash=?1`
  )
    .bind(hash)
    .first<{
      id: string; user_id: string; org_id: string | null; status: string;
      expires_at: number | null; ip_whitelist: string | null; model_whitelist: string | null;
      requires_signing: number; quota_usd: number | null; spent_usd: number;
    }>();
  if (!row) throw new ApiError(401, ErrorCode.AUTH_INVALID, "API Key 无效");
  if (row.status === "revoked") throw new ApiError(401, ErrorCode.KEY_REVOKED, "API Key 已撤销");
  if (row.expires_at && row.expires_at < now) throw new ApiError(401, ErrorCode.KEY_EXPIRED, "API Key 已过期");
  if (row.quota_usd !== null && row.spent_usd >= row.quota_usd) {
    throw new ApiError(429, ErrorCode.KEY_QUOTA_EXCEEDED, "该 API Key 额度已用尽");
  }

  const ip = clientIp(c.req);
  if (row.ip_whitelist) {
    const list = JSON.parse(row.ip_whitelist) as string[];
    if (list.length && !list.includes(ip)) {
      throw new ApiError(403, ErrorCode.FORBIDDEN, `来源 IP ${ip} 不在白名单内`);
    }
  }

  const settings = await getSettings(c.env.DB);
  const limits: RateLimits = {
    rpm: settings.defaultRpm,
    tpm: settings.defaultTpm,
    concurrency: 8,
  };

  // 可选请求签名（防重放 + 防篡改）：X-Timestamp(秒) + X-Signature = HMAC-SHA256(body, key)
  if (row.requires_signing) {
    await verifyRequestSignature(c.env, c.req, plaintext);
  }

  await c.env.DB.prepare("UPDATE api_keys SET last_used_at=?1 WHERE id=?2")
    .bind(now, row.id)
    .run();

  return {
    keyId: row.id,
    userId: row.user_id,
    orgId: row.org_id,
    requiresSigning: !!row.requires_signing,
    ipWhitelist: row.ip_whitelist ? JSON.parse(row.ip_whitelist) : null,
    modelWhitelist: row.model_whitelist ? JSON.parse(row.model_whitelist) : null,
    limits,
  };
}

/** 防重放：时间窗 ±300s；防篡改：HMAC 覆盖完整请求体；防重放：签名哈希进 KV 去重 */
async function verifyRequestSignature(env: MinimalEnv, req: MinimalReq, plaintextKey: string): Promise<void> {
  const ts = req.header("x-timestamp");
  const sig = req.header("x-signature");
  if (!ts || !sig) {
    throw new ApiError(401, ErrorCode.SIGNATURE_INVALID, "该 Key 要求请求签名：缺少 X-Timestamp / X-Signature");
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts, 10)) > 300) {
    throw new ApiError(401, ErrorCode.SIGNATURE_INVALID, "时间戳超出容忍窗口（防重放）");
  }
  const body = await req.text(); // HonoRequest 缓存 body，可重复读取
  const expect = await hmacHex(plaintextKey, `${ts}.${body}`);
  if (!(await timingSafeEqualHex(sig, expect))) {
    throw new ApiError(401, ErrorCode.SIGNATURE_INVALID, "签名校验失败");
  }
  const { claimSignatureNonce, sigHashOf } = await import("./ratelimit");
  const ok = await claimSignatureNonce(env, await sigHashOf(sig), ts);
  if (!ok) throw new ApiError(401, ErrorCode.SIGNATURE_INVALID, "检测到重放请求");
}

export function clientIp(req: MinimalReq): string {
  return (
    req.header("cf-connecting-ip") ??
    req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "0.0.0.0"
  );
}

export function billingScope(userId: string, orgId: string | null): string {
  return orgId ? `org:${orgId}` : `user:${userId}`;
}
