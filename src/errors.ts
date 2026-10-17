/** 结构化错误码（对外统一返回 OpenAI 兼容 error 对象 + 平台扩展字段） */
export const ErrorCode = {
  AUTH_REQUIRED: "auth_required",
  AUTH_INVALID: "auth_invalid",
  KEY_REVOKED: "key_revoked",
  KEY_EXPIRED: "key_expired",
  FORBIDDEN: "forbidden",
  STEP_UP_REQUIRED: "step_up_required",
  NOT_FOUND: "not_found",
  MODEL_NOT_FOUND: "model_not_found",
  MODEL_NOT_ALLOWED: "model_not_allowed",
  RATE_LIMITED: "rate_limited",
  INSUFFICIENT_BALANCE: "insufficient_balance",
  KEY_QUOTA_EXCEEDED: "key_quota_exceeded",
  CONTENT_BLOCKED: "content_blocked",
  BAD_REQUEST: "bad_request",
  UPSTREAM_ERROR: "upstream_error",
  UPSTREAM_TIMEOUT: "upstream_timeout",
  NO_ROUTE_AVAILABLE: "no_route_available",
  COMPLIANCE_REQUIRED: "compliance_required",
  SIGNATURE_INVALID: "signature_invalid",
  INTERNAL: "internal_error",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCodeValue,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export function errorResponse(_c: unknown, err: unknown): Response {
  if (err instanceof ApiError) {
    return openAiError(err.status, err.code, err.message, err.details);
  }
  console.error("internal_error", err);
  return openAiError(500, ErrorCode.INTERNAL, "Internal server error");
}

/** OpenAI 兼容错误格式，附加平台结构化扩展字段 */
export function openAiError(
  status: number,
  code: ErrorCodeValue,
  message: string,
  details?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({
      error: {
        message,
        type: code,
        code,
        ...(details ? { details } : {}),
      },
    }),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...(status === 429 && details?.retry_after
          ? { "retry-after": String(details.retry_after) }
          : {}),
      },
    }
  );
}
