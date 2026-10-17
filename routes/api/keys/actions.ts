/**
 * POST /api/keys/actions — Key 撤销 / 轮换
 *  body: { action: "revoke" | "rotate", keyId }
 *  - revoke：立即失效（旧 Key 无法恢复）
 *  - rotate：撤销旧 Key 并生成新 Key（明文仅返回一次）
 * 全部操作写入审计日志。
 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { requireUser } from "../../../src/auth";
import { ApiError, ErrorCode, errorResponse } from "../../../src/errors";
import { generateApiKey, uuid } from "../../../src/crypto";
import { json } from "../../../src/settings";
import { audit } from "../../../src/audit";
import { clientIp } from "../../../src/auth";

export const POST = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const user = await requireUser(c);
    const body = await c.req.json<{ action?: "revoke" | "rotate"; keyId?: string }>();
    if (!body.action || !body.keyId) throw new ApiError(400, ErrorCode.BAD_REQUEST, "缺少 action 或 keyId");

    const now = Math.floor(Date.now() / 1000);
    const row = await env.DB
      .prepare("SELECT id, name, quota_usd, expires_at, ip_whitelist, model_whitelist, requires_signing FROM api_keys WHERE id=?1 AND user_id=?2 AND status='active'")
      .bind(body.keyId, user.id)
      .first<{ id: string; name: string; quota_usd: number | null; expires_at: number | null; ip_whitelist: string | null; model_whitelist: string | null; requires_signing: number }>();
    if (!row) throw new ApiError(404, ErrorCode.NOT_FOUND, "Key 不存在或已撤销");

    await env.DB.prepare("UPDATE api_keys SET status='revoked', revoked_at=?2 WHERE id=?1").bind(row.id, now).run();

    if (body.action === "revoke") {
      await audit(c, { actorUserId: user.id, actorIp: clientIp(c.req), action: "key.revoke", targetType: "api_key", targetId: row.id });
      return json({ ok: true, revoked: row.id });
    }

    // rotate
    const key = generateApiKey();
    const newId = uuid();
    await env.DB.prepare(
      `INSERT INTO api_keys (id, user_id, name, key_hash, prefix, status, quota_usd, expires_at,
        ip_whitelist, model_whitelist, requires_signing, created_at)
       VALUES (?1,?2,?3,?4,?5,'active',?6,?7,?8,?9,?10,?11)`
    )
      .bind(newId, user.id, row.name, await key.hashPromise, key.prefix, row.quota_usd, row.expires_at, row.ip_whitelist, row.model_whitelist, row.requires_signing, now)
      .run();
    await audit(c, { actorUserId: user.id, actorIp: clientIp(c.req), action: "key.rotate", targetType: "api_key", targetId: `${row.id}->${newId}` });
    return json({ ok: true, revoked: row.id, created: { id: newId, prefix: key.prefix, key: key.plaintext, warning: "请立即保存，之后无法再次查看。" } });
  } catch (err) {
    return errorResponse(c, err);
  }
});
