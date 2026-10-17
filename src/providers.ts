/**
 * 上游适配层
 *  - MVP 统一走 OpenAI 兼容协议（OpenAI / DeepSeek 原生兼容；Anthropic、Google 均提供官方 OpenAI 兼容端点）
 *  - AI Gateway：若配置 CF_ACCOUNT_ID + AI_GATEWAY_ID，自动把上游地址包进 AI Gateway（获得缓存/日志/限速）
 *  - 合规要点：上游密钥仅在内存中短暂解密使用；对外绝不回显 upstreamModel 等上游细节
 */
import type { Env, UpstreamRoute } from "./types";
import { decryptSecret } from "./crypto";

export function aiGatewayUrl(env: Env, providerSlug: string, upstreamUrl: string): string {
  if (!env.CF_ACCOUNT_ID || !env.AI_GATEWAY_ID) return upstreamUrl;
  const slugMap: Record<string, string> = {
    openai: "openai",
    anthropic: "anthropic",
    google: "google-vertexai", // 或 google-ai-studio，按实际接入方式调整
    deepseek: "deepseek",
  };
  const gwSlug = slugMap[providerSlug] ?? providerSlug;
  return `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/${gwSlug}`;
}

export function resolveTarget(env: Env, route: UpstreamRoute, chatPath = "/v1/chat/completions"): { url: string; headers: Record<string, string> } {
  const base = route.baseUrl.replace(/\/+$/, "");
  const url = aiGatewayUrl(env, route.providerSlug, base) + chatPath;
  return { url, headers: {} };
}

export async function buildHeaders(env: Env, route: UpstreamRoute): Promise<Record<string, string>> {
  const upstreamKey = await decryptSecret(env, route.encryptedKey);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    // Workers fetch 默认不带 UA，部分上游网关的 WAF 会拦截空 UA（表现为 403/429）
    "user-agent": "EdgeRelay/1.0 (+https://api.obitw.cn)",
    ...(route.extraHeaders ?? {}),
  };
  if (route.authScheme === "x-api-key") {
    headers["x-api-key"] = upstreamKey;
  } else {
    headers["authorization"] = `Bearer ${upstreamKey}`;
  }
  return headers;
}

/** 可重试的 HTTP 错误码 */
export const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/** 粗略 token 估算（无法拿到 usage 时的兜底；约 4 字符/token） */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
