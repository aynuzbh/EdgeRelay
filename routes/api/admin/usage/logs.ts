/**
 * GET /api/admin/usage/logs?limit=50&offset=0&status=&model=&userId=
 * — 用量日志分页查询（管理员/审计员），仅元数据
 */
import { defineHandler } from "void";
import type { Env } from "../../../../src/types";
import { requireUser, requireRole } from "../../../../src/auth";
import { errorResponse } from "../../../../src/errors";
import { json } from "../../../../src/settings";

export const GET = defineHandler(async (c) => {
  try {
    const user = await requireUser(c);
    requireRole(user, ["admin", "auditor"]);
    const env = c.env as unknown as Env;
    const url = new URL(c.req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 500);
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
    const status = url.searchParams.get("status")?.trim();
    const model = url.searchParams.get("model")?.trim();
    const userId = url.searchParams.get("userId")?.trim();

    const where: string[] = [];
    const binds: (string | number)[] = [];
    if (status) { where.push("status = ?"); binds.push(status); }
    if (model) { where.push("public_model = ?"); binds.push(model); }
    if (userId) { where.push("user_id = ?"); binds.push(userId); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM usage_logs ${whereSql}`).bind(...binds).first<{ n: number }>();
    const { results } = await env.DB.prepare(
      `SELECT id, request_id, user_id, api_key_id, public_model, provider_id, status, http_status,
              latency_ms, prompt_tokens, completion_tokens, cost_usd, stream, error_code, attempts, ip, created_at
       FROM usage_logs ${whereSql}
       ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
    )
      .bind(...binds)
      .all();
    return json({ total: total?.n ?? 0, limit, offset, logs: results });
  } catch (err) {
    return errorResponse(c, err);
  }
});
