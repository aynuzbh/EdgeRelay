/**
 * POST /v1/chat/completions — OpenAI 兼容入口
 *
 * 全链路：
 *  1. API Key 认证（哈希查库 + IP/模型白名单 + 可选签名防重放）
 *  2. KV 限流（RPM / TPM / 并发）
 *  3. 内容安全钩子（可配置，命中进人工复核队列）
 *  4. 冻结预估额度（余额不足 -> 402）
 *  5. 按优先级/成本选择上游路由，失败自动 failover（最多 3 次尝试）
 *  6. 流式 SSE 透传（stream_options.include_usage 捕获真实 token 数）
 *  7. 结算：实际 usage 扣费、差额解冻、写 usage_logs 与 ledger 流水
 *
 * 日志脱敏：usage_logs 仅记录元数据，默认不落 prompt/响应内容。
 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { authenticateApiKey, billingScope, clientIp } from "../../../src/auth";
import { ApiError, ErrorCode, errorResponse, openAiError } from "../../../src/errors";
import { checkRateLimit, checkTpmBeforeRequest, reportTokenUsage, releaseConcurrency } from "../../../src/ratelimit";
import { moderate } from "../../../src/moderation";
import { getSettings } from "../../../src/settings";
import { requireRoutes } from "../../../src/router";
import { getPricing, hold, settle, releaseHold, estimateCost } from "../../../src/billing";
import { buildHeaders, resolveTarget, RETRYABLE_STATUS, estimateTokens } from "../../../src/providers";
import { uuid } from "../../../src/crypto";

export const POST = defineHandler(async (c) => {
  const env = c.env as unknown as Env;
  const requestId = c.req.header("x-request-id") || uuid();
  const started = Date.now();
  let released = false;

  try {
    const key = await authenticateApiKey(c);
    const settings = await getSettings(env.DB);

    const body = await c.req.json<{
      model?: string;
      stream?: boolean;
      messages?: { role: string; content: unknown }[];
      max_tokens?: number;
      stream_options?: { include_usage?: boolean };
    }>();
    if (!body.model || !Array.isArray(body.messages)) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, "缺少 model 或 messages");
    }
    const publicModel = body.model;

    if (key.modelWhitelist && !key.modelWhitelist.includes(publicModel)) {
      throw new ApiError(403, ErrorCode.MODEL_NOT_ALLOWED, `该 Key 无权调用模型 ${publicModel}`);
    }

    /* ---- 限流 ---- */
    if (!(await checkTpmBeforeRequest(env, key.keyId, key.limits))) {
      return openAiError(429, ErrorCode.RATE_LIMITED, "TPM 超限", { retry_after: 60 });
    }
    const limit = await checkRateLimit(env, key.keyId, key.limits);
    if (!limit.ok) {
      return openAiError(429, ErrorCode.RATE_LIMITED, `${limit.kind?.toUpperCase()} 超限，请稍后重试`, {
        retry_after: limit.retryAfter,
      });
    }

    /* ---- 内容安全（审核钩子） ---- */
    const promptText = body.messages
      .filter((m) => m.role === "user")
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n");
    const mod = await moderate(c, {
      settings,
      userId: key.userId,
      apiKeyId: key.keyId,
      requestId,
      model: publicModel,
      text: promptText,
    });
    if (mod.flagged) {
      await logUsage(env, { requestId, key, model: publicModel, status: "content_blocked", httpStatus: 400, latencyMs: Date.now() - started, ip: clientIp(c.req) });
      throw new ApiError(400, ErrorCode.CONTENT_BLOCKED, "请求内容触发安全策略，已被拦截并进入人工复核", { rule: mod.rule, request_id: requestId });
    }

    /* ---- 路由与计费预检 ---- */
    const routes = await requireRoutes(env.DB, publicModel);
    const pricing = await getPricing(env.DB, publicModel);
    const estPrompt = estimateTokens(promptText);
    const estCompletion = body.max_tokens ?? 1024;
    const estCost = pricing ? estimateCost(pricing, estPrompt, estCompletion) : 0;
    const scope = billingScope(key.userId, key.orgId);
    const { holdId } = await hold(c, scope, estCost, requestId);

    /* ---- 依次尝试上游（故障转移） ---- */
    const stream = !!body.stream;
    let attempts = 0;
    let lastUpstreamError = "";
    for (const route of routes.slice(0, 3)) {
      attempts++;
      try {
        const { url } = resolveTarget(env, route);
        const headers = await buildHeaders(env, route);
        const upstreamBody: Record<string, unknown> = {
          ...body,
          model: route.upstreamModel, // 仅上游可见；对外不回显映射关系以外的细节
        };
        if (stream) upstreamBody.stream_options = { include_usage: true };

        // 同路由 429 退避重试：部分上游按时间窗口限流，间隔重试即可恢复
        let resp: Response | null = null;
        for (let sub = 0; sub < 3; sub++) {
          if (sub > 0) {
            const retryAfter = Number(resp?.headers.get("retry-after"));
            const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 8000) : 1500 * sub;
            await new Promise((r) => setTimeout(r, delay));
          }
          resp = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(upstreamBody),
            signal: AbortSignal.timeout(120_000),
          });
          if (resp.status === 429 && sub < 2) {
            lastUpstreamError = `upstream 429 (retry ${sub + 1}/2)`;
            continue;
          }
          if (resp.status === 429) {
            // 重试耗尽：抓取上游 429 响应体，便于定位是 WAF 拦截还是配额限流
            const t = await resp.text().catch(() => "");
            lastUpstreamError = `upstream 429: ${t.slice(0, 160) || "(空响应体)"}`;
          }
          break;
        }
        if (!resp) continue;

        if (RETRYABLE_STATUS.has(resp.status)) {
          // 429 的详细信息已在退避重试循环中记录（含响应体），不覆盖
          if (!(resp.status === 429 && lastUpstreamError.startsWith("upstream 429:"))) {
            lastUpstreamError = `upstream ${resp.status}`;
          }
          continue; // failover 到下一路由
        }
        if (!resp.ok) {
          lastUpstreamError = `upstream ${resp.status}`;
          const errText = await resp.text();
          await logUsage(env, { requestId, key, model: publicModel, providerId: route.providerId, status: "upstream_error", httpStatus: resp.status, latencyMs: Date.now() - started, attempts, errorCode: ErrorCode.UPSTREAM_ERROR, ip: clientIp(c.req) });
          await releaseHold(c, scope, holdId, estCost, requestId);
          released = true;
          // 统一错误格式（不透传上游原文，避免泄露内部信息）
          return openAiError(resp.status >= 500 ? 502 : resp.status, ErrorCode.UPSTREAM_ERROR, "上游供应商返回错误", {
            upstream_status: resp.status,
            request_id: requestId,
            hint: errText.slice(0, 200),
          });
        }

        /* ---- 成功路径 ---- */
        if (!stream) {
          const json = (await resp.json()) as {
            usage?: { prompt_tokens?: number; completion_tokens?: number };
            [k: string]: unknown;
          };
          const promptTokens = json.usage?.prompt_tokens ?? estPrompt;
          const completionTokens = json.usage?.completion_tokens ?? estCompletion;
          const cost = pricing ? estimateCost(pricing, promptTokens, completionTokens) : 0;
          await settle(c, { scope, holdId, heldAmount: estCost, actualCost: cost, requestId, userId: key.userId, apiKeyId: key.keyId });
          released = true;
          await reportTokenUsage(env, key.keyId, promptTokens + completionTokens);
          await logUsage(env, {
            requestId, key, model: publicModel, providerId: route.providerId, upstreamModel: route.upstreamModel,
            status: "success", httpStatus: 200, latencyMs: Date.now() - started, attempts,
            promptTokens, completionTokens, cost, stream: false, ip: clientIp(c.req),
          });
          // 透明化：保留上游真实 model 字段，附加 gateway 元数据
          return new Response(JSON.stringify({ ...json, gateway: { request_id: requestId, public_model: publicModel, provider: route.providerSlug } }), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8", "x-request-id": requestId },
          });
        }

        // 流式：SSE 透传 + 从 usage chunk 捕获真实 token 数
        return streamResponse({
          upstream: resp,
          requestId,
          onFinish: async (usage) => {
            const promptTokens = usage?.prompt_tokens ?? estPrompt;
            const completionTokens = usage?.completion_tokens ?? estCompletion;
            const cost = pricing ? estimateCost(pricing, promptTokens, completionTokens) : 0;
            try {
              await settle(c, { scope, holdId, heldAmount: estCost, actualCost: cost, requestId, userId: key.userId, apiKeyId: key.keyId });
              released = true;
              await reportTokenUsage(env, key.keyId, promptTokens + completionTokens);
            } finally {
              await logUsage(env, {
                requestId, key, model: publicModel, providerId: route.providerId, upstreamModel: route.upstreamModel,
                status: "success", httpStatus: 200, latencyMs: Date.now() - started, attempts,
                promptTokens, completionTokens, cost, stream: true, ip: clientIp(c.req),
              });
            }
          },
        });
      } catch (e) {
        lastUpstreamError = e instanceof Error ? e.message : String(e);
        continue; // 网络异常 -> failover
      }
    }

    /* ---- 全部路由失败 ---- */
    if (!released) await releaseHold(c, scope, holdId, estCost, requestId);
    await logUsage(env, { requestId, key, model: publicModel, status: "no_route", httpStatus: 502, latencyMs: Date.now() - started, attempts, errorCode: ErrorCode.NO_ROUTE_AVAILABLE, ip: clientIp(c.req) });
    throw new ApiError(502, ErrorCode.NO_ROUTE_AVAILABLE, "所有上游路由均失败", {
      request_id: requestId,
      last_error: lastUpstreamError,
      attempts,
    });
  } catch (err) {
    return errorResponse(c, err);
  } finally {
    // 并发计数释放（尽力而为）
    try {
      const authHeader = c.req.header("authorization") ?? "";
      if (authHeader.includes("sk-gw-")) {
        const { sha256Hex } = await import("../../../src/crypto");
        const keyHash = await sha256Hex(authHeader.replace(/^Bearer\s+/i, ""));
        const row = await env.DB.prepare("SELECT id FROM api_keys WHERE key_hash=?1").bind(keyHash).first<{ id: string }>();
        if (row) await releaseConcurrency(env, row.id);
      }
    } catch { /* 尽力而为 */ }
  }
});

/* ---------- 流式 SSE 透传（扫描 usage chunk） ---------- */

type Usage = { prompt_tokens: number; completion_tokens: number };

function streamResponse(opts: {
  upstream: Response;
  requestId: string;
  onFinish: (usage?: Usage) => Promise<void>;
}): Response {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let captured: Usage | undefined;

  const transform = new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.includes('"usage"') && line.trim().startsWith("data:")) {
          try {
            const payload = JSON.parse(line.replace(/^data:\s*/, "")) as { usage?: Usage };
            if (payload.usage && (payload.usage.prompt_tokens || payload.usage.completion_tokens)) {
              captured = payload.usage;
            }
          } catch { /* 非 usage chunk，忽略 */ }
        }
        controller.enqueue(encoder.encode(line + "\n\n"));
      }
    },
    async flush() {
      await opts.onFinish(captured).catch((e) => console.error("settle_stream_failed", e));
    },
  });

  return new Response(opts.upstream.body!.pipeThrough(transform), {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "x-request-id": opts.requestId,
      "x-accel-buffering": "no",
    },
  });
}

/* ---------- 用量日志（仅元数据，无 prompt/响应内容） ---------- */

async function logUsage(
  env: Env,
  args: {
    requestId: string;
    key: { keyId: string; userId: string; orgId: string | null };
    model: string;
    providerId?: string;
    upstreamModel?: string;
    status: string;
    httpStatus: number;
    latencyMs: number;
    attempts?: number;
    errorCode?: string;
    promptTokens?: number;
    completionTokens?: number;
    cost?: number;
    stream?: boolean;
    ip: string;
  }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO usage_logs (id, request_id, user_id, api_key_id, org_id, public_model, provider_id, upstream_model,
      status, http_status, latency_ms, prompt_tokens, completion_tokens, cost_usd, currency, stream, error_code, attempts, ip, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,'CNY',?15,?16,?17,?18,?19)`
  )
    .bind(
      uuid(),
      args.requestId,
      args.key.userId,
      args.key.keyId,
      args.key.orgId,
      args.model,
      args.providerId ?? null,
      args.upstreamModel ?? null,
      args.status,
      args.httpStatus,
      args.latencyMs,
      args.promptTokens ?? 0,
      args.completionTokens ?? 0,
      args.cost ?? 0,
      args.stream ? 1 : 0,
      args.errorCode ?? null,
      args.attempts ?? 1,
      args.ip,
      Math.floor(Date.now() / 1000)
    )
    .run();
}
