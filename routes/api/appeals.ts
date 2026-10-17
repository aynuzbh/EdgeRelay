/**
 * POST /api/appeals — 用户提交申诉（封禁/Key 撤销/内容拦截）
 * GET  /api/appeals — 查看自己的申诉进度
 */
import { defineHandler } from "void";
import type { Env } from "../../src/types";
import { requireUser } from "../../src/auth";
import { ApiError, ErrorCode, errorResponse } from "../../src/errors";
import { uuid } from "../../src/crypto";
import { json } from "../../src/settings";
import { audit } from "../../src/audit";
import { clientIp } from "../../src/auth";

export const POST = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const user = await requireUser(c);
    const body = await c.req.json<{ targetType?: string; targetId?: string; reason?: string }>();
    if (!body.reason || body.reason.length < 10) throw new ApiError(400, ErrorCode.BAD_REQUEST, "请填写至少 10 字的申诉理由");
    if (!["user_ban", "key_revoke", "content_block"].includes(body.targetType ?? "")) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, "targetType 非法");
    }
    const id = uuid();
    await env.DB.prepare(
      `INSERT INTO appeals (id, user_id, target_type, target_id, reason, status, created_at) VALUES (?1,?2,?3,?4,?5,'open',?6)`
    )
      .bind(id, user.id, body.targetType, body.targetId ?? null, body.reason, Math.floor(Date.now() / 1000))
      .run();
    await audit(c, { actorUserId: user.id, actorIp: clientIp(c.req), action: "appeal.create", targetType: body.targetType, targetId: id });
    return json({ ok: true, appealId: id }, 201);
  } catch (err) {
    return errorResponse(c, err);
  }
});

export const GET = defineHandler(async (c) => {
  try {
    const user = await requireUser(c);
    const { results } = await (c.env as unknown as Env).DB.prepare(
      "SELECT id, target_type, target_id, status, decision_note, created_at, decided_at FROM appeals WHERE user_id=?1 ORDER BY created_at DESC"
    )
      .bind(user.id)
      .all();
    return json({ appeals: results });
  } catch (err) {
    return errorResponse(c, err);
  }
});
