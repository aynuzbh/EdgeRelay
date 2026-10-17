/**
 * POST /api/auth/register — 注册
 * 合规：必须确认服务条款与隐私政策（settings 开关控制）；记录审计日志。
 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { ApiError, ErrorCode, errorResponse } from "../../../src/errors";
import { uuid, hashPassword, decryptSecret } from "../../../src/crypto";
import { sendMail } from "../../../src/smtp";
import { topup } from "../../../src/billing";
import { verifyCodeEmailHtml } from "../../../src/email-templates";
import { getSettings, assertTosAccepted, json, corsHeaders } from "../../../src/settings";
import { audit } from "../../../src/audit";
import { clientIp, sessionCookie } from "../../../src/auth";

export const POST = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const settings = await getSettings(env.DB);
    const body = await c.req.json<{
      action?: "send-code"; email?: string; password?: string; code?: string; inviteCode?: string; tosAccepted?: boolean; privacyAccepted?: boolean;
    }>();
    if (!body.email || !/^\S+@\S+\.\S+$/.test(body.email)) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, "邮箱格式不正确");
    }
    const smtpReady = settings.smtpEnabled && settings.smtpHost && settings.smtpPassEnc;

    /* ---- 发送注册验证码（SMTP 启用时） ---- */
    if (body.action === "send-code") {
      if (!smtpReady) throw new ApiError(503, ErrorCode.INTERNAL, "邮箱验证未启用");
      const exists = await env.DB.prepare("SELECT id FROM users WHERE email=?1").bind(body.email).first();
      if (exists) throw new ApiError(409, ErrorCode.BAD_REQUEST, "邮箱已注册，请直接登录");
      // 60 秒发送间隔，防刷
      if (await env.KV.get(`emailcode:sent:${body.email}`)) {
        throw new ApiError(429, ErrorCode.RATE_LIMITED, "发送过于频繁，请 1 分钟后再试");
      }
      const code = String(Math.floor(100000 + Math.random() * 900000));
      try {
        await sendMail({
        host: settings.smtpHost!,
        port: settings.smtpPort ?? 465,
        username: settings.smtpUsername ?? settings.smtpFrom ?? "",
        password: await decryptSecret(env, settings.smtpPassEnc!),
        from: settings.smtpFrom ?? settings.smtpUsername ?? "",
      }, {
        to: body.email,
        subject: `${settings.siteName ?? "EdgeRelay"} 注册验证码`,
        text: `你正在注册 ${settings.siteName ?? "EdgeRelay"} 账号。\n\n验证码：${code}\n\n10 分钟内有效。若非本人操作，请忽略本邮件。`,
        html: verifyCodeEmailHtml(settings.siteName ?? "EdgeRelay", code),
      });
      // 发送成功后才写入验证码与限流标记，失败时不占用重试机会
      await env.KV.put(`emailcode:${body.email}`, code, { expirationTtl: 600 });
      await env.KV.put(`emailcode:sent:${body.email}`, "1", { expirationTtl: 60 });
      } catch (e) {
        throw new ApiError(502, ErrorCode.UPSTREAM_ERROR, `邮件发送失败：${e instanceof Error ? e.message : e}（请检查 SMTP 配置）`);
      }
      await audit(c, { actorIp: clientIp(c.req), action: "auth.register_code_sent", targetType: "user", meta: { email: body.email } });
      return json({ ok: true, message: "验证码已发送（10 分钟内有效）" });
    }

    if (!body.password || body.password.length < 10) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, "密码至少 10 位");
    }
    assertTosAccepted(body, settings); // 合规开关：服务条款 + 隐私政策确认

    const exists = await env.DB.prepare("SELECT id FROM users WHERE email=?1").bind(body.email).first();
    if (exists) throw new ApiError(409, ErrorCode.BAD_REQUEST, "邮箱已注册");

    // SMTP 启用时：注册必须携带邮箱验证码
    if (smtpReady) {
      const stored = await env.KV.get(`emailcode:${body.email}`);
      if (!stored || stored !== (body.code ?? "").trim()) {
        throw new ApiError(400, ErrorCode.BAD_REQUEST, "邮箱验证码无效或已过期，请重新获取");
      }
      await env.KV.delete(`emailcode:${body.email}`);
    }

    const now = Math.floor(Date.now() / 1000);
    const id = uuid();
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, status, tos_accepted_at, privacy_accepted_at, created_at, updated_at)
       VALUES (?1,?2,?3,'user','active',?4,?5,?6,?6)`
    )
      .bind(id, body.email, await hashPassword(body.password), body.tosAccepted ? now : null, body.privacyAccepted ? now : null, now)
      .run();
    // 邀请码绑定 + 奖励发放（可选）
    let inviterId: string | null = null;
    const inviteCode = (body.inviteCode ?? "").trim().toUpperCase();
    if (inviteCode) {
      const inviter = await env.DB.prepare("SELECT id FROM users WHERE invite_code=?1").bind(inviteCode).first<{ id: string }>();
      if (inviter && inviter.id !== id) {
        inviterId = inviter.id;
        await env.DB.prepare("UPDATE users SET invited_by=?2 WHERE id=?1").bind(id, inviterId).run();
        const regReward = settings.inviteRegisterReward ?? 0;
        const invReward = settings.inviteRewardAmount ?? 0;
        if (regReward > 0) await topup({ env } as never, `user:${id}`, regReward, "新人注册奖励");
        if (invReward > 0) await topup({ env } as never, `user:${inviterId}`, invReward, `邀请奖励（新用户 ${body.email}）`);
      }
    }
    // 初始化余额（0）
    await env.DB.prepare(
      `INSERT OR IGNORE INTO balances (id, scope, available, frozen, currency, updated_at) VALUES (?1,?2,0,0,'CNY',?3)`
    )
      .bind(uuid(), `user:${id}`, now)
      .run();

    await audit(c, { actorUserId: id, actorIp: clientIp(c.req), action: "auth.register", targetType: "user", targetId: id });

    // 注册成功即登录：创建会话并写入 Cookie（「保持登录状态」开启时 10 年有效）
    const ttl = settings.persistentSession ? 10 * 365 * 86400 : 7 * 86400;
    const sid = uuid();
    await env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at, ip, user_agent) VALUES (?1,?2,?3,?4,?5,?6)")
      .bind(sid, id, now, now + ttl, clientIp(c.req), c.req.header("user-agent") ?? "")
      .run();

    return sessionCookie(
      json({ id, email: body.email, termsOfServiceUrl: settings.termsOfServiceUrl, privacyPolicyUrl: settings.privacyPolicyUrl }, 201, corsHeaders(env, c.req.header("origin"))),
      env.SESSION_SECRET, sid, ttl
    );
  } catch (err) {
    return errorResponse(c, err);
  }
});
