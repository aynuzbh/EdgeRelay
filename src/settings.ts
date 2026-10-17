import type { Env, PlatformSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { ApiError, ErrorCode } from "./errors";

/* ---------- 平台合规开关 ---------- */

export async function getSettings(db: Env["DB"]): Promise<PlatformSettings> {
  const row = await db.prepare("SELECT value FROM settings WHERE key='platform'").first<{ value: string }>();
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function updateSettings(db: Env["DB"], patch: Partial<PlatformSettings>): Promise<void> {
  const cur = await getSettings(db);
  const next = { ...cur, ...patch };
  const now = Math.floor(Date.now() / 1000);
  const value = JSON.stringify(next);
  await db
    .prepare("INSERT INTO settings (key,value,updated_at) VALUES ('platform',?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(value, now)
    .run();
}

/** 注册前合规校验：必须完成服务条款与隐私政策确认 */
export function assertTosAccepted(body: { tosAccepted?: boolean; privacyAccepted?: boolean }, s: PlatformSettings): void {
  if (!s.signupsEnabled) {
    throw new ApiError(403, ErrorCode.COMPLIANCE_REQUIRED, "注册暂未开放");
  }
  if (s.requireTosAcceptance && !body.tosAccepted) {
    throw new ApiError(400, ErrorCode.COMPLIANCE_REQUIRED, "必须先确认服务条款", {
      termsOfServiceUrl: s.termsOfServiceUrl,
    });
  }
  if (s.requireTosAcceptance && !body.privacyAccepted) {
    throw new ApiError(400, ErrorCode.COMPLIANCE_REQUIRED, "必须先确认隐私政策", {
      privacyPolicyUrl: s.privacyPolicyUrl,
    });
  }
}

/* ---------- CORS 白名单 ---------- */

export function corsHeaders(env: Env, origin: string | null | undefined): Record<string, string> {
  const allow = (env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization,content-type,x-request-id,x-timestamp,x-signature",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && allow.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function withCors(resp: Response, headers: Record<string, string>): Response {
  const out = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}
