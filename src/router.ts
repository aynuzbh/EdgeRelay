/**
 * 路由与故障转移
 *  - 一个对外模型可映射多条上游路由（models 表）
 *  - 选择策略：priority 升序（越小越优先）→ cost_weight 升序
 *  - 返回有序候选列表，主路由失败按序 failover
 */
import type { Env, UpstreamRoute } from "./types";
import { ApiError, ErrorCode } from "./errors";

export async function listRoutes(db: Env["DB"], publicName: string): Promise<UpstreamRoute[]> {
  const { results } = await db
    .prepare(
      `SELECT m.id AS model_id, m.public_name, m.upstream_model, m.priority, m.cost_weight,
              p.id AS provider_id, p.slug AS provider_slug, p.kind, p.base_url, p.auth_scheme, p.extra_headers,
              pk.id AS provider_key_id, pk.encrypted_key
       FROM models m
       JOIN providers p ON p.id = m.provider_id AND p.status = 'active'
       JOIN provider_keys pk ON pk.provider_id = p.id AND pk.status = 'active'
       WHERE m.public_name = ?1 AND m.enabled = 1
       ORDER BY m.priority ASC, m.cost_weight ASC`
    )
    .bind(publicName)
    .all<{
      model_id: string; public_name: string; upstream_model: string; priority: number; cost_weight: number;
      provider_id: string; provider_slug: string; kind: string; base_url: string; auth_scheme: string;
      extra_headers: string | null; provider_key_id: string; encrypted_key: string;
    }>();

  return results.map((r) => ({
    modelId: r.model_id,
    providerId: r.provider_id,
    providerSlug: r.provider_slug,
    providerKind: r.kind,
    baseUrl: r.base_url,
    authScheme: r.auth_scheme,
    extraHeaders: r.extra_headers ? JSON.parse(r.extra_headers) : {},
    providerKeyId: r.provider_key_id,
    encryptedKey: r.encrypted_key,
    upstreamModel: r.upstream_model,
    priority: r.priority,
    costWeight: r.cost_weight,
  }));
}

export async function requireRoutes(db: Env["DB"], publicName: string): Promise<UpstreamRoute[]> {
  const routes = await listRoutes(db, publicName);
  if (!routes.length) {
    throw new ApiError(404, ErrorCode.MODEL_NOT_FOUND, `模型 ${publicName} 不存在或暂无可用上游`);
  }
  return routes;
}

/** 列出对外可见的模型（OpenAI /v1/models 格式） */
export async function listPublicModels(db: Env["DB"]): Promise<{ id: string; created: number; owned_by: string }[]> {
  const { results } = await db
    .prepare("SELECT DISTINCT public_name FROM models WHERE enabled = 1")
    .all<{ public_name: string }>();
  const created = Math.floor(Date.parse("2026-01-01") / 1000);
  return results.map((r) => ({ id: r.public_name, created, owned_by: "gateway" }));
}
