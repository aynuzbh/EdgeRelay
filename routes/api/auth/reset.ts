/**
 * POST /api/auth/reset — 密码重置（SMTP 发送验证码）
 *  { action: "request", email }   → 发送 6 位验证码（10 分钟有效；不暴露邮箱是否存在）
 *  { action: "confirm", email, code, password } → 校验并更新密码
 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { ApiError, ErrorCode, errorResponse } from "../../../src/errors";
import { getSettings } from "../../../src/settings";
import { decryptSecret } from "../../../src/crypto";
import { hashPassword } from "../../../src/crypto";
import { sendMail } from "../../../src/smtp";
import { verifyCodeEmailHtml } from "../../../src/email-templates";
import { audit } from "../../../src/audit";
import { clientIp } from "../../../src/auth";

export const POST = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const s = await getSettings(env.DB);
    const body = await c.req.json<{ action?: string; email?: string; code?: string; password?: string }>();
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) throw new ApiError(400, ErrorCode.BAD_REQUEST, "缺少邮箱");

    if (body.action === "request") {
      const row = await env.DB.prepare("SELECT id, status FROM users WHERE email=?1").bind(email).first<{ id: string; status: string }>();
      // 统一响应，避免枚举邮箱；但仅对存在的账号真正发信
      if (row && row.status === "active") {
        if (!s.smtpEnabled || !s.smtpHost || !s.smtpPassEnc) {
          throw new ApiError(503, ErrorCode.INTERNAL, "邮箱服务未配置，请联系管理员");
        }
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await env.KV.put(`pwreset:${email}`, JSON.stringify({ code, exp: Math.floor(Date.now() / 1000) + 600 }), { expirationTtl: 600 });
        const smtp = {
          host: s.smtpHost,
          port: s.smtpPort ?? 465,
          username: s.smtpUsername ?? s.smtpFrom ?? "",
          password: await decryptSecret(env, s.smtpPassEnc),
          from: s.smtpFrom ?? s.smtpUsername ?? "",
        };
        await sendMail(smtp, {
          to: email,
          subject: `${s.siteName ?? "EdgeRelay"} 密码重置验证码`,
          text: `你正在重置 ${s.siteName ?? "EdgeRelay"} 账号密码。\n\n验证码：${code}\n\n10 分钟内有效。若非本人操作，请忽略本邮件。`,
        });
        await audit(c, { actorIp: clientIp(c.req), action: "auth.reset_requested", targetType: "user", targetId: email });
      }
      return Response.json({ ok: true, message: "若邮箱已注册，验证码已发送（10 分钟内有效）" });
    }

    if (body.action === "confirm") {
      const raw = await env.KV.get(`pwreset:${email}`);
      if (!raw) throw new ApiError(400, ErrorCode.BAD_REQUEST, "验证码无效或已过期");
      const rec = JSON.parse(raw) as { code: string };
      if (rec.code !== (body.code ?? "").trim()) throw new ApiError(400, ErrorCode.BAD_REQUEST, "验证码错误");
      if (!body.password || body.password.length < 10) throw new ApiError(400, ErrorCode.BAD_REQUEST, "新密码至少 10 位");
      const row = await env.DB.prepare("SELECT id, status FROM users WHERE email=?1").bind(email).first<{ id: string; status: string }>();
      if (!row || row.status !== "active") throw new ApiError(400, ErrorCode.BAD_REQUEST, "账号不存在或不可用");
      const now = Math.floor(Date.now() / 1000);
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET password_hash=?2, updated_at=?3 WHERE id=?1").bind(row.id, await hashPassword(body.password), now),
        env.DB.prepare("DELETE FROM sessions WHERE user_id=?1").bind(row.id),
      ]);
      await env.KV.delete(`pwreset:${email}`);
      await audit(c, { actorUserId: row.id, actorIp: clientIp(c.req), action: "auth.reset_done", targetType: "user", targetId: row.id });
      return Response.json({ ok: true, message: "密码已重置，请使用新密码登录" });
    }

    throw new ApiError(400, ErrorCode.BAD_REQUEST, "未知操作");
  } catch (err) {
    return errorResponse(c, err);
  }
});
