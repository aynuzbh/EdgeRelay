/** 同源 API 客户端：自动携带 Cookie，step_up_required 时广播全局事件 */
export class ApiError extends Error {
  constructor(message: string, public code?: string, public status?: number) { super(message); }
}

export async function api<T = unknown>(path: string, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" = "GET", body?: unknown): Promise<T> {
  const opt: RequestInit = { method, credentials: "same-origin", headers: {} };
  if (body !== undefined) { opt.headers = { "content-type": "application/json" }; opt.body = JSON.stringify(body); }
  const r = await fetch(path, opt);
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const err = (data as { error?: { message?: string; code?: string } })?.error ?? {};
    if (err.code === "step_up_required") window.dispatchEvent(new CustomEvent("gw:stepup"));
    throw new ApiError(err.message ?? r.statusText, err.code, r.status);
  }
  return data as T;
}

export type Me = { user: { id: string; email: string; role: "user" | "admin" | "finance" | "auditor" }; nickname?: string | null; bio?: string | null; avatarUrl?: string | null; balance: { available: number; frozen: number; currency: string } };
export type Stats = { requests: number; errorRate: number; promptTokens: number; completionTokens: number; cost: number; currency: string; pendingContentFlags: number; byStatus: { status: string; n: number }[]; byModel: { public_model: string; n: number; cost: number }[] };
export type TrendPoint = { date: string; requests: number; tokens: number; errors: number; cost: number };
export type KeyRow = { id: string; name: string; prefix: string; status: string; quota_usd: number | null; spent_usd: number; expires_at: number | null; ip_whitelist: string | null; model_whitelist: string | null; requires_signing: number; created_at: number; last_used_at: number | null };
export type Provider = { id: string; name: string; slug: string; base_url: string; status: string; authorization_ref: string | null; authorization_expires_at: number | null; key_count: number };
export type ModelRow = { id: string; public_name: string; upstream_model: string; priority: number; cost_weight: number; enabled: number; provider_name: string | null; provider_slug: string | null; input_per_million: number | null; output_per_million: number | null; currency: string | null };
export type UsageLog = { id: string; request_id: string; user_id: string; public_model: string; status: string; http_status: number; latency_ms: number; prompt_tokens: number; completion_tokens: number; cost_usd: number; stream: number; error_code: string | null; attempts: number; ip: string; created_at: number };
export type AuditLog = { id: string; actor_user_id?: string; actor_email: string | null; actor_ip: string | null; action: string; target_type: string | null; target_id: string | null; meta: string | null; created_at: number };
export type UserRow = { id: string; email: string; role: string; status: string; created_at: number };
export type Flag = { id: string; user_id: string; public_model: string | null; rule: string; excerpt_hash: string | null; status: string; created_at: number };
export type Appeal = { id: string; user_id: string; target_type: string; reason: string; status: string; created_at: number };
export type PlatformSettings = Record<string, unknown> & { signupsEnabled?: boolean; requireTosAcceptance?: boolean; contentModerationEnabled?: boolean; logContentEnabled?: boolean; privacyPolicyUrl?: string; termsOfServiceUrl?: string; defaultRpm?: number; defaultTpm?: number; auditLogRetentionDays?: number };

export type SiteInfo = { siteName: string; siteDescription: string; siteLogoUrl: string; siteHomepage: string; oauth: { github: boolean; google: boolean }; smtpEnabled: boolean };

export const adminAction = <T = { ok: true; result?: unknown }>(action: string, payload: Record<string, unknown> = {}) =>
  api<T>("/api/admin/actions", "POST", { action, payload });
