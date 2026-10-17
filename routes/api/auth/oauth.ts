/**
 * GitHub / Google OAuth 登录（控制台可配置 clientId/clientSecret，密钥加密存储）
 *
 *  GET /api/auth/oauth?provider=github              → 302 跳转授权页
 *  GET /api/auth/oauth?provider=github&code=...&state=... → 回调：换取身份、建号/登录、写会话 Cookie、302 回 /
 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { ApiError, ErrorCode, errorResponse } from "../../../src/errors";
import { getSettings } from "../../../src/settings";
import { decryptSecret, uuid, hashPassword } from "../../../src/crypto";
import { sessionCookie } from "../../../src/auth";
import { audit } from "../../../src/audit";
import { clientIp } from "../../../src/auth";

type Provider = "github" | "google";
const PROVIDERS: Record<Provider, { authUrl: string; tokenUrl: string; scope: string }> = {
  github: { authUrl: "https://github.com/login/oauth/authorize", tokenUrl: "https://github.com/login/oauth/access_token", scope: "read:user user:email" },
  google: { authUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", scope: "openid email profile" },
};

export const GET = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const s = await getSettings(env.DB);
    const url = new URL(c.req.url);
    const provider = url.searchParams.get("provider") as Provider | null;
    if (!provider || !(provider in PROVIDERS)) throw new ApiError(400, ErrorCode.BAD_REQUEST, "不支持的登录方式");
    const enabled = provider === "github" ? s.oauthGithubEnabled : s.oauthGoogleEnabled;
    if (!enabled) throw new ApiError(404, ErrorCode.NOT_FOUND, "该登录方式未启用");
    const clientId = provider === "github" ? s.oauthGithubClientId : s.oauthGoogleClientId;
    const secretEnc = provider === "github" ? s.oauthGithubSecretEnc : s.oauthGoogleSecretEnc;
    if (!clientId || !secretEnc) throw new ApiError(500, ErrorCode.INTERNAL, "登录方式未配置完整");

    const redirectUri = `${url.origin}/api/auth/oauth?provider=${provider}&callback=1`;

    /* ---- 回调阶段 ---- */
    const code = url.searchParams.get("code");
    if (url.searchParams.get("callback") === "1") {
      const state = url.searchParams.get("state") ?? "";
      const stored = await env.KV.get(`oauth:state:${state}`);
      if (!stored || stored !== provider) throw new ApiError(400, ErrorCode.SIGNATURE_INVALID, "state 校验失败（防 CSRF）");
      await env.KV.delete(`oauth:state:${state}`);
      if (!code) throw new ApiError(400, ErrorCode.BAD_REQUEST, "缺少授权码");

      const clientSecret = await decryptSecret(env, secretEnc);
      // 换取 access_token
      const tokenResp = await fetch(PROVIDERS[provider].tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      });
      const token = (await tokenResp.json()) as { access_token?: string };
      if (!token.access_token) throw new ApiError(401, ErrorCode.AUTH_INVALID, "获取访问令牌失败");

      // 获取邮箱
      let email = "";
      if (provider === "github") {
        const u = await (await fetch("https://api.github.com/user", { headers: { authorization: `Bearer ${token.access_token}`, "user-agent": "EdgeRelay" } })).json() as { email?: string | null };
        if (u.email) email = u.email;
        else {
          const emails = await (await fetch("https://api.github.com/user/emails", { headers: { authorization: `Bearer ${token.access_token}`, "user-agent": "EdgeRelay" } })).json() as { email: string; primary: boolean; verified: boolean }[];
          email = (emails.find((e) => e.primary && e.verified) ?? emails[0])?.email ?? "";
        }
      } else {
        const u = await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${token.access_token}` } })).json() as { email?: string; email_verified?: boolean };
        if (u.email && u.email_verified !== false) email = u.email;
      }
      if (!email) throw new ApiError(401, ErrorCode.AUTH_INVALID, "未能获取已验证的邮箱");

      // 建号或登录
      const now = Math.floor(Date.now() / 1000);
      let row = await env.DB.prepare("SELECT id, status FROM users WHERE email=?1").bind(email).first<{ id: string; status: string }>();
      if (!row) {
        const id = uuid();
        await env.DB.prepare(
          `INSERT INTO users (id, email, password_hash, role, status, tos_accepted_at, privacy_accepted_at, created_at, updated_at)
           VALUES (?1,?2,?3,'user','active',?4,?4,?5,?5)`
        ).bind(id, email, await hashPassword(uuid()), now, now).run();
        await env.DB.prepare("INSERT INTO balances (id, scope, available, frozen, currency, updated_at) VALUES (?1,?2,0,0,'CNY',?3)")
          .bind(uuid(), `user:${id}`, now).run();
        row = { id, status: "active" };
        await audit(c, { actorUserId: id, actorIp: clientIp(c.req), action: "auth.oauth_register", targetType: "user", targetId: id, meta: { provider } });
      }
      if (row.status === "banned") throw new ApiError(403, ErrorCode.FORBIDDEN, "账号已封禁");
      if (row.status !== "active") throw new ApiError(403, ErrorCode.FORBIDDEN, "账号不可用");

      const sid = uuid();
      await env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at, ip, user_agent) VALUES (?1,?2,?3,?4,?5,?6)")
        .bind(sid, row.id, now, now + 7 * 86400, clientIp(c.req), c.req.header("user-agent") ?? "").run();
      await audit(c, { actorUserId: row.id, actorIp: clientIp(c.req), action: "auth.oauth_login", targetType: "user", targetId: row.id, meta: { provider } });

      const resp = sessionCookie(new Response(null, { status: 302, headers: { location: "/#/" } }), env.SESSION_SECRET, sid);
      return resp;
    }

    /* ---- 发起阶段 ---- */
    const state = uuid() + uuid();
    await env.KV.put(`oauth:state:${state}`, provider, { expirationTtl: 600 });
    const auth = new URL(PROVIDERS[provider].authUrl);
    auth.searchParams.set("client_id", clientId);
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("scope", PROVIDERS[provider].scope);
    auth.searchParams.set("state", state);
    return new Response(null, { status: 302, headers: { location: auth.toString() } });
  } catch (err) {
    return errorResponse(c, err);
  }
});
