/**
 * POST /api/webhooks/upstream — 上游供应商事件回调（如故障公告、额度预警、协议到期提醒）
 *
 * 安全：X-Webhook-Secret 与 env.ADMIN_BOOTSTRAP_TOKEN 比对（生产建议独立 secret + HMAC 签名）
 * 行为：写入审计日志；payload 不落敏感内容
 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { errorResponse, ApiError, ErrorCode } from "../../../src/errors";
import { timingSafeEqualHex } from "../../../src/crypto";
import { json } from "../../../src/settings";
import { audit } from "../../../src/audit";
import { clientIp } from "../../../src/auth";

export const POST = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const secret = c.req.header("x-webhook-secret") ?? "";
    if (!env.ADMIN_BOOTSTRAP_TOKEN || !(await timingSafeEqualHex(secret, env.ADMIN_BOOTSTRAP_TOKEN))) {
      throw new ApiError(401, ErrorCode.AUTH_INVALID, "Webhook 签名校验失败");
    }
    const body = await c.req.json<Record<string, unknown>>();
    await audit(c, {
      actorIp: clientIp(c.req),
      action: "webhook.upstream",
      targetType: String(body.provider ?? "unknown"),
      meta: body,
    });
    return json({ ok: true });
  } catch (err) {
    return errorResponse(c, err);
  }
});
