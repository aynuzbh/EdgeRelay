/**
 * GET /api/admin/stats — 实时用量与错误率（近 24 小时）
 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { requireUser, requireRole } from "../../../src/auth";
import { errorResponse } from "../../../src/errors";
import { json } from "../../../src/settings";

export const GET = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const user = await requireUser(c); // 只读统计：admin/auditor 免二次验证
    requireRole(user, ["admin", "auditor"]);
    const since = Math.floor(Date.now() / 1000) - 86400;
    const db = env.DB;

    const total = await db.prepare("SELECT COUNT(*) AS n, SUM(prompt_tokens) AS pt, SUM(completion_tokens) AS ct, SUM(cost_usd) AS cost FROM usage_logs WHERE created_at > ?1").bind(since).first<{ n: number; pt: number; ct: number; cost: number }>();
    const byStatus = await db.prepare("SELECT status, COUNT(*) AS n FROM usage_logs WHERE created_at > ?1 GROUP BY status").bind(since).all<{ status: string; n: number }>();
    const byModel = await db.prepare("SELECT public_model, COUNT(*) AS n, SUM(cost_usd) AS cost FROM usage_logs WHERE created_at > ?1 GROUP BY public_model ORDER BY n DESC LIMIT 20").bind(since).all();
    const flags = await db.prepare("SELECT COUNT(*) AS n FROM content_flags WHERE status='pending'").first<{ n: number }>();
    const auditOk = await db.prepare("SELECT hash FROM audit_logs ORDER BY created_at DESC LIMIT 1").first<{ hash: string }>();

    const totalN = total?.n ?? 0;
    const errorN = byStatus.results.filter((r) => r.status !== "success").reduce((a, r) => a + r.n, 0);
    return json({
      windowHours: 24,
      requests: totalN,
      errorRate: totalN ? +(errorN / totalN).toFixed(4) : 0,
      promptTokens: total?.pt ?? 0,
      completionTokens: total?.ct ?? 0,
      cost: total?.cost ?? 0,
      currency: "CNY",
      byStatus: byStatus.results,
      byModel: byModel.results,
      pendingContentFlags: flags?.n ?? 0,
      lastAuditHash: auditOk?.hash ?? null,
    });
  } catch (err) {
    return errorResponse(c, err);
  }
});
