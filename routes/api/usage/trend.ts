/** GET /api/usage/trend?days=7 — 当前用户自己的按天趋势 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { requireUser } from "../../../src/auth";
import { errorResponse } from "../../../src/errors";
import { json } from "../../../src/settings";

export const GET = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const u = await requireUser(c);
    const days = Math.min(Math.max(parseInt(new URL(c.req.url).searchParams.get("days") ?? "7", 10) || 7, 1), 90);
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    const { results } = await env.DB.prepare(
      `SELECT (created_at / 86400) * 86400 AS day,
              COUNT(*) AS requests,
              SUM(prompt_tokens + completion_tokens) AS tokens,
              SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS errors,
              SUM(cost_usd) AS cost
       FROM usage_logs WHERE created_at > ?1 AND user_id = ?2
       GROUP BY day ORDER BY day ASC`
    ).bind(since, u.id).all<{ day: number; requests: number; tokens: number | null; errors: number; cost: number }>();
    return json({ days, points: results.map((r) => ({ date: new Date(r.day * 1000).toISOString().slice(0, 10), requests: r.requests, tokens: r.tokens ?? 0, errors: r.errors, cost: r.cost ?? 0 })) });
  } catch (err) { return errorResponse(c, err); }
});
