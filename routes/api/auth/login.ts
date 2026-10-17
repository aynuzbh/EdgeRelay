/**
 * POST /api/auth/login — 登录（创建会话 Cookie）
 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { ApiError, ErrorCode, errorResponse } from "../../../src/errors";
import { uuid, verifyPassword } from "../../../src/crypto";
import { json, corsHeaders } from "../../../src/settings";
import { sessionCookie } from "../../../src/auth";
import { getSettings } from "../../../src/settings";
import { audit } from "../../../src/audit";
import { clientIp } from "../../../src/auth";

export const POST = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const body = await c.req.json<{ email?: string; password?: string }>();
    if (!body.email || !body.password) throw new ApiError(400, ErrorCode.BAD_REQUEST, "缺少邮箱或密码");

    const row = await env.DB
      .prepare("SELECT id, email, password_hash, status FROM users WHERE email=?1")
      .bind(body.email)
      .first<{ id: string; email: string; password_hash: string; status: string }>();
    // 统一错误信息，避免枚举用户
    if (!row || !(await verifyPassword(body.password, row.password_hash))) {
      await audit(c, { action: "auth.login_failed", targetType: "user", meta: { email: body.email }, actorIp: clientIp(c.req) });
      throw new ApiError(401, ErrorCode.AUTH_INVALID, "邮箱或密码错误");
    }
    if (row.status === "banned") {
      throw new ApiError(403, ErrorCode.FORBIDDEN, "账号已封禁，可前往 /api/appeals 提交申诉");
    }
    if (row.status !== "active") {
      throw new ApiError(403, ErrorCode.FORBIDDEN, "账号不可用");
    }

    const now = Math.floor(Date.now() / 1000);
    const sid = uuid();
    // 「保持登录状态」开启时会话 10 年有效
    const ttl = (await getSettings(env.DB)).persistentSession ? 10 * 365 * 86400 : 7 * 86400;
    await env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at, ip, user_agent) VALUES (?1,?2,?3,?4,?5,?6)")
      .bind(sid, row.id, now, now + ttl, clientIp(c.req), c.req.header("user-agent"))
      .run();
    await audit(c, { actorUserId: row.id, actorIp: clientIp(c.req), action: "auth.login", targetType: "user", targetId: row.id });

    return sessionCookie(json({ id: row.id, email: row.email }), env.SESSION_SECRET, sid, ttl);
  } catch (err) {
    return errorResponse(c, err);
  }
});
