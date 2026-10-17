/**
 * 内容安全钩子
 *  - 可配置启用（settings.contentModerationEnabled）
 *  - 本地规则：敏感词 blocklist（JSON 数组，支持正则）
 *  - 外部钩子：MODERATION_API_URL（POST {input} -> {flagged, rule}），可对接云厂商内容安全 API
 *  - 命中：写入 content_flags（进入人工复核队列），返回结构化 400 content_blocked
 *  - 隐私：默认只存 SHA-256 摘要与脱敏片段，不存原文
 */
import type { HandlerCtx, PlatformSettings } from "./types";
import { sha256Hex, uuid } from "./crypto";

export type ModerationResult = { flagged: boolean; rule?: string; maskedExcerpt?: string };

export async function moderate(
  c: HandlerCtx,
  args: { settings: PlatformSettings; userId: string; apiKeyId?: string; requestId: string; model: string; text: string }
): Promise<ModerationResult> {
  const s = args.settings;
  if (!s.contentModerationEnabled) return { flagged: false };

  // 1) 本地规则
  for (const pattern of s.blocklist) {
    let re: RegExp;
    try {
      re = new RegExp(pattern, "iu");
    } catch {
      re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu");
    }
    if (re.test(args.text)) {
      await recordFlag(c, args, `local:${pattern}`);
      return { flagged: true, rule: `local:${pattern}` };
    }
  }

  // 2) 外部审核 API（可选）
  const moderationUrl = typeof c.env.MODERATION_API_URL === "string" ? c.env.MODERATION_API_URL : undefined;
  if (moderationUrl) {
    try {
      const resp = await fetch(moderationUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: args.text, model: args.model, requestId: args.requestId }),
      });
      const result = (await resp.json()) as { flagged?: boolean; rule?: string };
      if (result.flagged) {
        await recordFlag(c, args, result.rule ?? "external");
        return { flagged: true, rule: result.rule ?? "external" };
      }
    } catch (e) {
      // 审核 API 不可用时：fail-closed 还是 fail-open 由策略决定，MVP 默认放行并告警
      console.error("moderation_api_error", e);
    }
  }
  return { flagged: false };
}

async function recordFlag(
  c: HandlerCtx,
  args: { settings: PlatformSettings; userId: string; apiKeyId?: string; requestId: string; model: string; text: string },
  rule: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const excerptHash = await sha256Hex(args.text);
  const masked = args.settings.logContentEnabled
    ? args.text.slice(0, 120).replace(/[\u4e00-\u9fa5\w]{2,}/g, (w) => (w.length > 2 ? w[0] + "***" : "*"))
    : null;
  await c.env.DB.prepare(
    `INSERT INTO content_flags (id, user_id, api_key_id, request_id, public_model, rule, excerpt_hash, excerpt_masked, status, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'pending',?9)`
  )
    .bind(uuid(), args.userId, args.apiKeyId ?? null, args.requestId, args.model, rule, excerptHash, masked, now)
    .run();
}
