/**
 * GET /api/models — 面向登录用户的模型与定价列表（含上游映射，透明展示）
 */
import { defineHandler } from "void";
import type { Env } from "../../src/types";
import { requireUser } from "../../src/auth";
import { errorResponse } from "../../src/errors";
import { json } from "../../src/settings";

export const GET = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    await requireUser(c);
    const { results } = await env.DB.prepare(
      `SELECT m.id, m.public_name, m.upstream_model, m.priority, m.cost_weight, m.enabled,
              p.name AS provider_name, p.slug AS provider_slug,
              pr.input_per_million, pr.output_per_million, pr.currency
       FROM models m
       LEFT JOIN providers p ON p.id = m.provider_id
       LEFT JOIN model_pricing pr ON pr.public_name = m.public_name
       ORDER BY m.public_name, m.priority`
    ).all();
    return json({ ok: true, models: results });
  } catch (err) { return errorResponse(c, err); }
});
