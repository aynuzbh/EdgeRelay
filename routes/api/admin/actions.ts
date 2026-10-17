/**
 * POST /api/admin/actions — 管理操作统一入口
 *
 * 安全：
 *  - 必须登录且 role=admin
 *  - 强制二次验证（requireAdminStepUp，先调 /api/auth/stepup）
 *  - 所有操作写入审计日志（哈希链）
 *
 * 支持的 action：
 *  users:    list_users, set_role, ban_user, unban_user
 *  keys:     list_all_keys, revoke_any_key
 *  供应商:    upsert_provider, upsert_provider_key, list_providers
 *  模型:      upsert_model, set_pricing
 *  计费:      topup
 *  合规:      get_settings, set_settings, verify_audit_chain
 *  审核:      flags_queue, resolve_flag, appeals_list, resolve_appeal
 */
import { defineHandler } from "void";
import type { Env, PlatformSettings } from "../../../src/types";
import { requireAdminStepUp, requireUser, requireRole } from "../../../src/auth";
import { ApiError, ErrorCode, errorResponse } from "../../../src/errors";
import { uuid, encryptSecret, decryptSecret, sha256Hex } from "../../../src/crypto";
import { getSettings, updateSettings, json } from "../../../src/settings";
import { audit, verifyAuditChain } from "../../../src/audit";
import { topup } from "../../../src/billing";
import { clientIp } from "../../../src/auth";

export const POST = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const body = await c.req.json<{ action?: string; payload?: Record<string, unknown> }>();
    const action = body.action ?? "";
    const p = body.payload ?? {};
    const db = env.DB;
    const now = Math.floor(Date.now() / 1000);

    // 权限分层：只读操作仅需 admin/auditor；变更操作强制二次验证
    const READ_ACTIONS = new Set([
      "list_users", "list_all_keys", "list_providers", "list_models", "list_pricing",
      "get_settings", "flags_queue", "appeals_list", "list_audit", "get_smtp", "get_oauth",
      "list_announcements",
    ]);
    const user = await requireUser(c);
    let admin = user;
    if (READ_ACTIONS.has(action)) {
      requireRole(user, ["admin", "auditor"]);
    } else {
      admin = await requireAdminStepUp(c);
    }

    const done = async (result: unknown, targetType?: string, targetId?: string) => {
      await audit(c, {
        actorUserId: admin.id,
        actorIp: clientIp(c.req),
        action: `admin.${action}`,
        targetType,
        targetId,
        meta: p as Record<string, unknown>,
      });
      return json({ ok: true, result });
    };

    switch (action) {
      /* ---- 用户管理 ---- */
      case "list_users": {
        const { results } = await db.prepare("SELECT id, email, role, status, created_at FROM users ORDER BY created_at DESC LIMIT 500").all();
        return json({ ok: true, users: results });
      }
      case "set_role": {
        const role = String(p.role);
        if (!["user", "admin", "finance", "auditor"].includes(role)) throw new ApiError(400, ErrorCode.BAD_REQUEST, "非法角色");
        await db.prepare("UPDATE users SET role=?2, updated_at=?3 WHERE id=?1").bind(String(p.userId), role, now).run();
        return done(null, "user", String(p.userId));
      }
      case "ban_user": {
        await db.prepare("UPDATE users SET status='banned', updated_at=?2 WHERE id=?1").bind(String(p.userId), now).run();
        await db.prepare("UPDATE api_keys SET status='revoked', revoked_at=?2 WHERE user_id=?1 AND status='active'").bind(String(p.userId), now).run();
        await db.prepare("DELETE FROM sessions WHERE user_id=?1").bind(String(p.userId)).run();
        return done(null, "user", String(p.userId));
      }
      case "unban_user": {
        await db.prepare("UPDATE users SET status='active', updated_at=?2 WHERE id=?1").bind(String(p.userId), now).run();
        return done(null, "user", String(p.userId));
      }

      /* ---- Key 管理 ---- */
      case "list_all_keys": {
        const { results } = await db.prepare("SELECT id, user_id, name, prefix, status, quota_usd, spent_usd, created_at FROM api_keys ORDER BY created_at DESC LIMIT 500").all();
        return json({ ok: true, keys: results });
      }
      case "revoke_any_key": {
        await db.prepare("UPDATE api_keys SET status='revoked', revoked_at=?2 WHERE id=?1").bind(String(p.keyId), now).run();
        return done(null, "api_key", String(p.keyId));
      }

      /* ---- 供应商管理（密钥加密入库） ---- */
      case "upsert_provider": {
        const isNew = !p.id;
        // 新建供应商必须同时录入密钥（合规：避免出现无法溯源的"空壳"上游）
        if (isNew && !p.key) throw new ApiError(400, ErrorCode.BAD_REQUEST, "添加供应商必须同时录入上游密钥");
        const id = (p.id as string) || uuid();
        await db.prepare(
          `INSERT INTO providers (id, name, slug, kind, base_url, auth_scheme, extra_headers, status, authorization_ref, authorization_expires_at, created_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
           ON CONFLICT(id) DO UPDATE SET name=?2, slug=?3, kind=?4, base_url=?5, auth_scheme=?6, extra_headers=?7, status=?8,
             authorization_ref=?9, authorization_expires_at=?10`
        )
          .bind(
            id, String(p.name), String(p.slug), String(p.kind ?? "openai_compat"), String(p.baseUrl),
            String(p.authScheme ?? "bearer"), p.extraHeaders ? JSON.stringify(p.extraHeaders) : null,
            String(p.status ?? "active"), (p.authorizationRef as string) ?? null,
            (p.authorizationExpiresAt as number) ?? null, now
          )
          .run();
        // 密钥可选更新（新建时必填，编辑时留空保持不变）
        if (p.key) {
          const plaintext = String(p.key);
          await db.prepare(
            `INSERT INTO provider_keys (id, provider_id, label, encrypted_key, key_fingerprint, status, created_at)
             VALUES (?1,?2,?3,?4,?5,'active',?6)`
          ).bind(uuid(), id, "default", await encryptSecret(env, plaintext), (await sha256Hex(plaintext)).slice(0, 16), now).run();
        }
        // 合规强制项：必须登记授权凭证编号
        if (!p.authorizationRef) {
          await audit(c, { actorUserId: admin.id, action: "admin.provider_no_authorization", targetType: "provider", targetId: id, meta: { warning: "未登记上游授权协议编号" } });
        }
        return done({ id }, "provider", id);
      }
      case "delete_provider": {
        const id = String(p.id);
        // 级联：模型映射、上游密钥随供应商一并删除
        await db.batch([
          db.prepare("DELETE FROM models WHERE provider_id=?1").bind(id),
          db.prepare("DELETE FROM provider_keys WHERE provider_id=?1").bind(id),
          db.prepare("DELETE FROM providers WHERE id=?1").bind(id),
        ]);
        return done(null, "provider", id);
      }
      case "list_upstream_models": {
        const providerId = String(p.providerId);
        const prov = await db.prepare("SELECT slug, base_url, auth_scheme, extra_headers FROM providers WHERE id=?1").bind(providerId).first<{ slug: string; base_url: string; auth_scheme: string; extra_headers: string | null }>();
        const keyRow = await db.prepare("SELECT encrypted_key FROM provider_keys WHERE provider_id=?1 AND status='active' ORDER BY created_at DESC LIMIT 1").bind(providerId).first<{ encrypted_key: string }>();
        if (!prov || !keyRow) throw new ApiError(400, ErrorCode.BAD_REQUEST, "供应商不存在或未录入密钥");
        const upstreamKey = await decryptSecret(env, keyRow.encrypted_key);
        const { aiGatewayUrl } = await import("../../../src/providers");
        const base = aiGatewayUrl(env, prov.slug, prov.base_url.replace(/\/+$/, ""));
        const headers: Record<string, string> = {
          "user-agent": "EdgeRelay/1.0 (+https://api.obitw.cn)",
          ...(prov.extra_headers ? JSON.parse(prov.extra_headers) : {}),
        };
        if (prov.auth_scheme === "x-api-key") headers["x-api-key"] = upstreamKey;
        else headers["authorization"] = `Bearer ${upstreamKey}`;
        // 缓存命中：上游对 /v1/models 限流严格，10 分钟内复用上次结果
        const cacheKey = `upstreammodels:${providerId}`;
        const cached = await env.KV.get(cacheKey);
        if (cached) {
          return json({ ok: true, models: JSON.parse(cached) as string[], cached: true });
        }
        // 429/5xx 自动重试一次
        let resp: Response | null = null;
        let lastStatus = 0;
        for (let attempt = 0; attempt < 2; attempt++) {
          resp = await fetch(`${base}/v1/models`, { headers, signal: AbortSignal.timeout(20000) });
          if (resp.ok) break;
          lastStatus = resp.status;
          if (resp.status === 429 || resp.status >= 500) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          break;
        }
        if (!resp || !resp.ok) {
          const hint = lastStatus === 429
            ? "上游限流(429)：该上游对模型列表接口限流严格，请约 1 分钟后重试（成功后会缓存 10 分钟）"
            : lastStatus === 401 || lastStatus === 403
            ? "上游鉴权失败，请检查密钥是否正确"
            : `上游返回 ${lastStatus}`;
          throw new ApiError(502, ErrorCode.UPSTREAM_ERROR, `获取模型列表失败：${hint}`);
        }
        const data = await resp.json() as { data?: { id?: string }[] };
        const models = (data.data ?? []).map((m) => m.id).filter((x): x is string => !!x).sort();
        await env.KV.put(cacheKey, JSON.stringify(models), { expirationTtl: 600 });
        return json({ ok: true, models });
      }
      case "import_models": {
        const providerId = String(p.providerId);
        const ids = Array.isArray(p.models) ? (p.models as string[]).slice(0, 200) : [];
        if (!ids.length) throw new ApiError(400, ErrorCode.BAD_REQUEST, "未选择要导入的模型");
        const priority = Number(p.priority ?? 10);
        let imported = 0;
        for (const upstreamModel of ids) {
          const exists = await db.prepare("SELECT id FROM models WHERE public_name=?1 AND provider_id=?2 AND upstream_model=?3").bind(upstreamModel, providerId, upstreamModel).first();
          if (exists) continue;
          await db.prepare(
            `INSERT INTO models (id, public_name, provider_id, upstream_model, priority, cost_weight, enabled, created_at)
             VALUES (?1,?2,?3,?4,?5,1,1,?6)`
          ).bind(uuid(), upstreamModel, providerId, upstreamModel, priority, now).run();
          imported++;
        }
        return done({ imported }, "model", providerId);
      }
      case "delete_model": {
        await db.prepare("DELETE FROM models WHERE id=?1").bind(String(p.id)).run();
        return done(null, "model", String(p.id));
      }
      case "upsert_provider_key": {
        const providerId = String(p.providerId);
        const plaintext = String(p.key);
        if (!plaintext) throw new ApiError(400, ErrorCode.BAD_REQUEST, "缺少 key");
        const id = uuid();
        await db.prepare(
          `INSERT INTO provider_keys (id, provider_id, label, encrypted_key, key_fingerprint, status, created_at)
           VALUES (?1,?2,?3,?4,?5,'active',?6)`
        )
          .bind(id, providerId, String(p.label ?? "default"), await encryptSecret(env, plaintext), (await sha256Hex(plaintext)).slice(0, 16), now)
          .run();
        // 审计日志只记指纹，绝不记录明文
        return done({ id, fingerprint: (await sha256Hex(plaintext)).slice(0, 16) }, "provider_key", id);
      }
      case "list_providers": {
        const { results } = await db.prepare(
          `SELECT p.id, p.name, p.slug, p.kind, p.base_url, p.auth_scheme, p.status, p.authorization_ref,
                  p.authorization_expires_at, (SELECT COUNT(*) FROM provider_keys pk WHERE pk.provider_id=p.id AND pk.status='active') AS key_count
           FROM providers p ORDER BY p.created_at DESC`
        ).all();
        return json({ ok: true, providers: results });
      }

      /* ---- 模型映射与定价 ---- */
      case "list_models": {
        const { results } = await db.prepare(
          `SELECT m.id, m.public_name, m.upstream_model, m.priority, m.cost_weight, m.enabled,
                  p.name AS provider_name, p.slug AS provider_slug,
                  pr.input_per_million, pr.output_per_million, pr.currency
           FROM models m
           LEFT JOIN providers p ON p.id = m.provider_id
           LEFT JOIN model_pricing pr ON pr.public_name = m.public_name
           ORDER BY m.public_name, m.priority`
        ).all();
        return json({ ok: true, models: results });
      }
      case "list_pricing": {
        const { results } = await db.prepare("SELECT * FROM model_pricing ORDER BY public_name").all();
        return json({ ok: true, pricing: results });
      }
      case "list_audit": {
        const limit = Math.min(Number(p.limit ?? 200), 1000);
        const { results } = await db.prepare(
          `SELECT a.id, a.actor_user_id, u.email AS actor_email, a.actor_ip, a.action, a.target_type, a.target_id, a.meta, a.created_at
           FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
           ORDER BY a.created_at DESC LIMIT ?1`
        ).bind(limit).all();
        return json({ ok: true, logs: results });
      }
      case "upsert_model": {
        const id = (p.id as string) || uuid();
        await db.prepare(
          `INSERT INTO models (id, public_name, provider_id, upstream_model, priority, cost_weight, max_context, enabled, created_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
           ON CONFLICT(id) DO UPDATE SET public_name=?2, provider_id=?3, upstream_model=?4, priority=?5, cost_weight=?6, max_context=?7, enabled=?8`
        )
          .bind(id, String(p.publicName), String(p.providerId), String(p.upstreamModel), Number(p.priority ?? 100), Number(p.costWeight ?? 1), (p.maxContext as number) ?? null, p.enabled === false ? 0 : 1, now)
          .run();
        return done({ id }, "model", id);
      }
      case "set_pricing": {
        const id = uuid();
        await db.prepare(
          `INSERT INTO model_pricing (id, public_name, input_per_million, output_per_million, currency, created_at)
           VALUES (?1,?2,?3,?4,?5,?6)
           ON CONFLICT(public_name) DO UPDATE SET input_per_million=?3, output_per_million=?4, currency=?5`
        )
          .bind(id, String(p.publicName), Number(p.inputPerMillion), Number(p.outputPerMillion), String(p.currency ?? "CNY"), now)
          .run();
        return done(null, "model_pricing", String(p.publicName));
      }

      /* ---- 计费 ---- */
      case "topup": {
        const scope = String(p.scope); // user:{id} | org:{id}
        const amount = Number(p.amount);
        if (!/^(user|org):\S+$/.test(scope) || !Number.isFinite(amount)) throw new ApiError(400, ErrorCode.BAD_REQUEST, "scope 或 amount 非法");
        await topup(c, scope, amount, String(p.memo ?? "admin topup"));
        return done(null, "balance", scope);
      }

      /* ---- 合规开关 ---- */
      case "get_settings": {
        const s = await getSettings(db);
        return json({ ok: true, settings: s });
      }
      case "set_settings": {
        // 白名单：仅允许常规合规/限流/站点信息字段。
        // OAuth 与 SMTP 配置必须走 set_oauth / set_smtp（密钥加密存储），
        // 避免旧前端状态把已保存的登录配置覆盖回去。
        const ALLOWED = new Set([
          "signupsEnabled", "requireTosAcceptance", "contentModerationEnabled", "logContentEnabled",
          "privacyPolicyUrl", "termsOfServiceUrl", "defaultRpm", "defaultTpm", "auditLogRetentionDays",
          "siteName", "siteDescription", "siteLogoUrl", "siteHomepage", "blocklist",
          "stepUpDisabled", "persistentSession",
          "inviteRegisterReward", "inviteRewardAmount", "inviteDailyTop1", "inviteDailyTop2", "inviteDailyTop3",
        ]);
        const patch: Partial<PlatformSettings> = {};
        for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
          if (ALLOWED.has(k)) (patch as Record<string, unknown>)[k] = v;
        }
        await updateSettings(db, patch);
        return done(null, "settings", "platform");
      }
      case "verify_audit_chain": {
        const result = await verifyAuditChain(db, 2000);
        return json({ ok: true, result });
      }

      /* ---- 内容审核与申诉 ---- */
      case "flags_queue": {
        const { results } = await db.prepare("SELECT * FROM content_flags WHERE status='pending' ORDER BY created_at DESC LIMIT 200").all();
        return json({ ok: true, flags: results });
      }
      case "resolve_flag": {
        await db.prepare("UPDATE content_flags SET status=?2, reviewer_id=?3, review_note=?4, reviewed_at=?5 WHERE id=?1")
          .bind(String(p.flagId), String(p.decision), admin.id, (p.note as string) ?? null, now).run();
        return done(null, "content_flag", String(p.flagId));
      }
      case "appeals_list": {
        const { results } = await db.prepare("SELECT * FROM appeals WHERE status='open' ORDER BY created_at ASC").all();
        return json({ ok: true, appeals: results });
      }
      case "resolve_appeal": {
        const status = String(p.decision); // accepted | rejected
        await db.prepare("UPDATE appeals SET status=?2, decision_note=?3, decided_by=?4, decided_at=?5 WHERE id=?1")
          .bind(String(p.appealId), status, (p.note as string) ?? null, admin.id, now).run();
        return done(null, "appeal", String(p.appealId));
      }

      /* ---- 站点信息 ---- */
      case "upsert_site_logo": {
        const dataUrl = String(p.dataBase64 ?? "");
        const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,(.+)$/);
        if (!m) throw new ApiError(400, ErrorCode.BAD_REQUEST, "仅支持 base64 图片（png/jpeg/webp/svg）");
        const bytes = Uint8Array.from(atob(m[2]!), (ch) => ch.charCodeAt(0));
        if (bytes.length > 512 * 1024) throw new ApiError(400, ErrorCode.BAD_REQUEST, "Logo 不能超过 512KB");
        const ext = m[1] === "image/svg+xml" ? "svg" : m[1] === "image/jpeg" ? "jpg" : m[1] === "image/webp" ? "webp" : "png";
        let logoUrl = `/logo.${ext}`;
        if (env.STORAGE) {
          await env.STORAGE.put(`site/logo.${ext}`, bytes);
          logoUrl = `/api/site/logo?v=${now}`; // 经 R2 提供，可随时替换
        }
        await updateSettings(db, { siteLogoUrl: logoUrl });
        return done({ logoUrl }, "settings", "siteLogoUrl");
      }
      case "set_smtp": {
        const patch: Partial<PlatformSettings> = {
          smtpEnabled: !!p.enabled,
          smtpHost: String(p.host ?? ""),
          smtpPort: Number(p.port ?? 465),
          smtpUsername: String(p.username ?? ""),
          smtpFrom: String(p.from ?? ""),
        };
        if (p.password) patch.smtpPassEnc = await encryptSecret(env, String(p.password));
        await updateSettings(db, patch);
        return done(null, "settings", "smtp");
      }
      case "get_smtp": {
        const s = await getSettings(db);
        return json({ ok: true, smtp: { enabled: !!s.smtpEnabled, host: s.smtpHost ?? "", port: s.smtpPort ?? 465, username: s.smtpUsername ?? "", from: s.smtpFrom ?? "", passwordSet: !!s.smtpPassEnc } });
      }
      case "set_oauth": {
        const patch: Partial<PlatformSettings> = {
          oauthGithubEnabled: !!p.githubEnabled,
          oauthGoogleEnabled: !!p.googleEnabled,
        };
        if (p.githubClientId !== undefined) patch.oauthGithubClientId = String(p.githubClientId);
        if (p.googleClientId !== undefined) patch.oauthGoogleClientId = String(p.googleClientId);
        if (p.githubClientSecret) patch.oauthGithubSecretEnc = await encryptSecret(env, String(p.githubClientSecret));
        if (p.googleClientSecret) patch.oauthGoogleSecretEnc = await encryptSecret(env, String(p.googleClientSecret));
        await updateSettings(db, patch);
        return done(null, "settings", "oauth");
      }
      case "get_oauth": {
        const s = await getSettings(db);
        return json({
          ok: true,
          oauth: {
            github: { enabled: !!s.oauthGithubEnabled, clientId: s.oauthGithubClientId ?? "", secretSet: !!s.oauthGithubSecretEnc },
            google: { enabled: !!s.oauthGoogleEnabled, clientId: s.oauthGoogleClientId ?? "", secretSet: !!s.oauthGoogleSecretEnc },
          },
        });
      }

      case "create_announcement": {
        const title = String(p.title ?? "").trim();
        const content = String(p.content ?? "").trim();
        if (!title || !content) throw new ApiError(400, ErrorCode.BAD_REQUEST, "标题与内容不能为空");
        const aid = uuid();
        await db.prepare(
          `INSERT INTO announcements (id, title, content, popup, enabled, created_by, created_at, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?7)`
        ).bind(aid, title, content, p.popup ? 1 : 0, p.enabled === false ? 0 : 1, admin.id, now).run();
        return done({ id: aid }, "announcement", aid);
      }
      case "update_announcement": {
        await db.prepare(
          `UPDATE announcements SET title=?2, content=?3, popup=?4, enabled=?5, updated_at=?6 WHERE id=?1`
        ).bind(String(p.id), String(p.title ?? ""), String(p.content ?? ""), p.popup ? 1 : 0, p.enabled === false ? 0 : 1, now).run();
        return done(null, "announcement", String(p.id));
      }
      case "delete_announcement": {
        await db.prepare("DELETE FROM announcements WHERE id=?1").bind(String(p.id)).run();
        return done(null, "announcement", String(p.id));
      }
      case "list_announcements": {
        const { results } = await db.prepare("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 100").all();
        return json({ ok: true, announcements: results });
      }
      case "delete_usage_log": {
        await db.prepare("DELETE FROM usage_logs WHERE id=?1").bind(String(p.id)).run();
        return done(null, "usage_log", String(p.id));
      }
      case "clear_usage_logs": {
        const days = Number(p.days ?? 0);
        if (days > 0) {
          const before = now - days * 86400;
          const r = await db.prepare("DELETE FROM usage_logs WHERE created_at < ?1").bind(before).run();
          return done({ deleted: r.meta?.changes ?? 0 }, "usage_logs", `before_${days}d`);
        }
        const r = await db.prepare("DELETE FROM usage_logs").run();
        return done({ deleted: r.meta?.changes ?? 0 }, "usage_logs", "all");
      }
      case "clear_audit_logs": {
        await db.prepare("DELETE FROM audit_logs").run();
        return done(null, "audit_logs", "all");
      }
      case "delete_audit_log": {
        await db.prepare("DELETE FROM audit_logs WHERE id=?1").bind(String(p.id)).run();
        // 删除会破坏哈希链，删除后自动重建
        const { rebuildAuditChain } = await import("../../../src/audit");
        const rebuilt = await rebuildAuditChain(db);
        return done({ rebuilt }, "audit_log", String(p.id));
      }

      default:
        throw new ApiError(400, ErrorCode.BAD_REQUEST, `未知操作: ${action}`);
    }
  } catch (err) {
    return errorResponse(c, err);
  }
});
