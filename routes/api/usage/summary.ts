/** GET /api/usage/summary — 当前用户自己的用量统计（近 24h） */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { requireUser } from "../../../src/auth";
import { errorResponse } from "../../../src/errors";
import { json } from "../../../src/settings";

export const GET = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const u = await requireUser(c);
    const since = Math.floor(Date.now() / 1000) - 86400;
    const db = env.DB;
    const total = await db.prepare(
      "SELECT COUNT(*) AS n, SUM(prompt_tokens) AS pt, SUM(completion_tokens) AS ct, SUM(cost_usd) AS cost FROM usage_logs WHERE created_at > ?1 AND user_id = ?2"
    ).bind(since, u.id).first<{ n: number; pt: number; ct: number; cost: number }>();
    const byStatus = await db.prepare("SELECT status, COUNT(*) AS n FROM usage_logs WHERE created_at > ?1 AND user_id = ?2 GROUP BY status").bind(since, u.id).all<{ status: string; n: number }>();
    const byModel = await db.prepare("SELECT public_model, COUNT(*) AS n, SUM(cost_usd) AS cost FROM usage_logs WHERE created_at > ?1 AND user_id = ?2 GROUP BY public_model ORDER BY n DESC LIMIT 20").bind(since, u.id).all<{ public_model: string; n: number; cost: number }>();
    const totalN = total?.n ?? 0;
    const errorN = byStatus.results.filter((r) => r.status !== "success").reduce((a, r) => a + r.n, 0);
    return json({
      requests: totalN,
      errorRate: totalN ? +(errorN / totalN).toFixed(4) : 0,
      promptTokens: total?.pt ?? 0,
      completionTokens: total?.ct ?? 0,
      cost: total?.cost ?? 0,
      currency: "CNY",
      byStatus: byStatus.results,
      byModel: byModel.results,
    });
  } catch (err) { return errorResponse(c, err); }
});
