/**
 * POST /api/auth/stepup — 管理接口二次验证（重新输入密码，10 分钟内有效）
 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { ApiError, ErrorCode, errorResponse } from "../../../src/errors";
import { requireUser } from "../../../src/auth";
import { verifyPassword } from "../../../src/crypto";
import { json } from "../../../src/settings";
import { audit } from "../../../src/audit";
import { clientIp } from "../../../src/auth";

export const POST = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const user = await requireUser(c);
    const body = await c.req.json<{ password?: string }>();
    if (!body.password) throw new ApiError(400, ErrorCode.BAD_REQUEST, "请重新输入密码确认");

    const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id=?1").bind(user.id).first<{ password_hash: string }>();
    if (!row || !(await verifyPassword(body.password, row.password_hash))) {
      throw new ApiError(401, ErrorCode.AUTH_INVALID, "密码错误");
    }
    const until = Math.floor(Date.now() / 1000) + 600;
    await env.DB.prepare("UPDATE users SET step_up_until=?1 WHERE id=?2").bind(until, user.id).run();
    await audit(c, { actorUserId: user.id, actorIp: clientIp(c.req), action: "auth.stepup" });
    return json({ ok: true, validUntil: until });
  } catch (err) {
    return errorResponse(c, err);
  }
});
