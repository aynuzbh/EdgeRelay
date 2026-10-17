/**
 * API Key 管理
 *  GET  /api/keys        — 列表（只显示前缀）
 *  POST /api/keys        — 创建（明文仅返回一次）
 *
 * 支持配置：额度(quotaUsd)、过期时间(expiresAt)、IP 白名单、模型白名单、强制签名
 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { requireUser } from "../../../src/auth";
import { ApiError, ErrorCode, errorResponse } from "../../../src/errors";
import { generateApiKey, uuid } from "../../../src/crypto";
import { json } from "../../../src/settings";
import { audit } from "../../../src/audit";
import { clientIp } from "../../../src/auth";

export const GET = defineHandler(async (c) => {
  try {
    const user = await requireUser(c);
    const env = c.env as unknown as Env;
    const { results } = await env.DB.prepare(
      `SELECT id, name, prefix, status, quota_usd, spent_usd, expires_at, ip_whitelist, model_whitelist,
              requires_signing, created_at, last_used_at
       FROM api_keys WHERE user_id=?1 AND status='active' ORDER BY created_at DESC`
    )
      .bind(user.id)
      .all();
    return json({ keys: results });
  } catch (err) {
    return errorResponse(c, err);
  }
});

export const POST = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const user = await requireUser(c);
    const body = await c.req.json<{
      name?: string; quotaUsd?: number; expiresAt?: number;
      ipWhitelist?: string[]; modelWhitelist?: string[]; requiresSigning?: boolean;
    }>();

    const key = generateApiKey(); // 明文只出现这一次
    const id = uuid();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO api_keys (id, user_id, name, key_hash, prefix, status, quota_usd, expires_at,
        ip_whitelist, model_whitelist, requires_signing, created_at)
       VALUES (?1,?2,?3,?4,?5,'active',?6,?7,?8,?9,?10,?11)`
    )
      .bind(
        id,
        user.id,
        body.name ?? "default",
        await key.hashPromise,
        key.prefix,
        body.quotaUsd ?? null,
        body.expiresAt ?? null,
        body.ipWhitelist ? JSON.stringify(body.ipWhitelist) : null,
        body.modelWhitelist ? JSON.stringify(body.modelWhitelist) : null,
        body.requiresSigning ? 1 : 0,
        now
      )
      .run();

    await audit(c, { actorUserId: user.id, actorIp: clientIp(c.req), action: "key.create", targetType: "api_key", targetId: id });

    return json(
      {
        id,
        name: body.name ?? "default",
        prefix: key.prefix,
        key: key.plaintext, // ⚠️ 仅此一次返回，服务端只存 SHA-256
        warning: "请立即保存此 Key，之后将无法再次查看。",
      },
      201
    );
  } catch (err) {
    return errorResponse(c, err);
  }
});
