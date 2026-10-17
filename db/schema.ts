import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/* ============================================================
 * 合规的 AI API 中转/聚合网关 — 数据模型
 * 原则：
 *  - API Key 只存 SHA-256 哈希，明文只在创建时返回一次
 *  - 上游供应商密钥 AES-256-GCM 加密存储（密钥材料来自 ENCRYPTION_KEY secret）
 *  - usage_logs 默认不落 prompt/响应内容（log_content 开关默认关闭，开启时也存脱敏摘要）
 *  - audit_logs 使用哈希链（prev_hash -> hash）提供防篡改证据，保留 >= 180 天
 * ============================================================ */

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(), // uuid
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(), // PBKDF2-SHA256(iter,salt,hash)
    role: text("role").notNull().default("user"), // user | admin | finance | auditor
    status: text("status").notNull().default("active"), // active | suspended | banned
    nickname: text("nickname"), // 用户昵称（个人主页）
    bio: text("bio"), // 个人介绍
    avatarUrl: text("avatar_url"), // 头像地址（R2）
    inviteCode: text("invite_code"), // 专属邀请码
    invitedBy: text("invited_by"), // 邀请人 userId
    tosAcceptedAt: integer("tos_accepted_at"), // 服务条款确认时间戳
    privacyAcceptedAt: integer("privacy_accepted_at"), // 隐私政策确认时间戳
    stepUpUntil: integer("step_up_until"), // 管理接口二次验证有效期
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)]
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // 随机 256bit
    userId: text("user_id").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)]
);

export const orgs = sqliteTable("orgs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  billingMode: text("billing_mode").notNull().default("user"), // user(个人余额) | org(组织余额)
  createdAt: integer("created_at").notNull(),
});

export const org_members = sqliteTable(
  "org_members",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("member"), // owner | admin | member | auditor
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("org_member_uq").on(t.orgId, t.userId)]
);

export const api_keys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    orgId: text("org_id"),
    name: text("name").notNull().default("default"),
    keyHash: text("key_hash").notNull(), // SHA-256(plaintext) 十六进制
    prefix: text("prefix").notNull(), // 明文前 12 位，仅用于界面展示
    status: text("status").notNull().default("active"), // active | revoked
    quotaUsd: real("quota_usd"), // Key 级额度上限（计价货币），NULL=不限
    spentUsd: real("spent_usd").notNull().default(0),
    expiresAt: integer("expires_at"), // 过期时间戳，NULL=永不过期
    ipWhitelist: text("ip_whitelist"), // JSON 数组，NULL=不限制
    modelWhitelist: text("model_whitelist"), // JSON 数组（对外统一模型名），NULL=不限制
    requiresSigning: integer("requires_signing").notNull().default(0), // 是否强制请求签名（防重放/防篡改）
    createdAt: integer("created_at").notNull(),
    revokedAt: integer("revoked_at"),
    lastUsedAt: integer("last_used_at"),
  },
  (t) => [
    uniqueIndex("api_keys_hash_uq").on(t.keyHash),
    index("api_keys_user_idx").on(t.userId),
  ]
);

export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // 展示名，如 "OpenAI"
  slug: text("slug").notNull(), // openai | anthropic | google | deepseek | ...
  kind: text("kind").notNull().default("openai_compat"), // 适配器类型（MVP 全部走 OpenAI 兼容层）
  baseUrl: text("base_url").notNull(),
  authScheme: text("auth_scheme").notNull().default("bearer"), // bearer | x-api-key
  extraHeaders: text("extra_headers"), // JSON：{"anthropic-version":"2023-06-01"}
  status: text("status").notNull().default("active"), // active | disabled
  // 合规凭证：与该供应商签署的代理/分销授权协议编号与有效期（审计用）
  authorizationRef: text("authorization_ref"),
  authorizationExpiresAt: integer("authorization_expires_at"),
  createdAt: integer("created_at").notNull(),
});

export const provider_keys = sqliteTable(
  "provider_keys",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id").notNull(),
    label: text("label").notNull().default("default"),
    encryptedKey: text("encrypted_key").notNull(), // AES-256-GCM 密文（base64 iv|ct|tag）
    keyFingerprint: text("key_fingerprint"), // SHA-256 前 16 位，用于展示/审计，不泄露原文
    status: text("status").notNull().default("active"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("provider_keys_provider_idx").on(t.providerId)]
);

/** 对外统一模型 -> 上游真实模型的映射（一个对外模型可配多条路由做故障转移） */
export const models = sqliteTable(
  "models",
  {
    id: text("id").primaryKey(),
    publicName: text("public_name").notNull(), // 对外统一名，如 "gpt-4o" / "claude-sonnet"
    providerId: text("provider_id").notNull(),
    upstreamModel: text("upstream_model").notNull(), // 上游真实模型名（绝不回显给调用方）
    priority: integer("priority").notNull().default(100), // 越小越优先（主备路由）
    costWeight: real("cost_weight").notNull().default(1), // 成本权重，同优先级时取低者
    maxContext: integer("max_context"),
    enabled: integer("enabled").notNull().default(1),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("models_public_idx").on(t.publicName)]
);

export const model_pricing = sqliteTable(
  "model_pricing",
  {
    id: text("id").primaryKey(),
    publicName: text("public_name").notNull(),
    inputPerMillion: real("input_per_million").notNull(), // 计价货币 / 1M input tokens
    outputPerMillion: real("output_per_million").notNull(), // 计价货币 / 1M output tokens
    currency: text("currency").notNull().default("CNY"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("pricing_name_uq").on(t.publicName)]
);

export const usage_logs = sqliteTable(
  "usage_logs",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(), // X-Request-Id / 内部生成
    userId: text("user_id").notNull(),
    apiKeyId: text("api_key_id"),
    orgId: text("org_id"),
    publicModel: text("public_model").notNull(),
    providerId: text("provider_id"),
    upstreamModel: text("upstream_model"),
    status: text("status").notNull(), // success | upstream_error | content_blocked | insufficient_balance | ...
    httpStatus: integer("http_status"),
    latencyMs: integer("latency_ms"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    currency: text("currency").notNull().default("CNY"),
    stream: integer("stream").notNull().default(0),
    errorCode: text("error_code"),
    attempts: integer("attempts").notNull().default(1),
    ip: text("ip"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("usage_user_time_idx").on(t.userId, t.createdAt),
    index("usage_key_time_idx").on(t.apiKeyId, t.createdAt),
  ]
);

export const balances = sqliteTable(
  "balances",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(), // user:{id} | org:{id}
    available: real("available").notNull().default(0),
    frozen: real("frozen").notNull().default(0), // 在途冻结额度
    currency: text("currency").notNull().default("CNY"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("balances_scope_uq").on(t.scope)]
);

export const ledger_entries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    userId: text("user_id"),
    type: text("type").notNull(), // topup | hold | capture | release | refund | adjustment
    amount: real("amount").notNull(), // 正数；方向由 type 决定
    balanceAfter: real("balance_after").notNull(),
    requestId: text("request_id"),
    memo: text("memo"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("ledger_scope_time_idx").on(t.scope, t.createdAt)]
);

/** KV 限流的持久化镜像/兜底（热路径走 KV，本表用于审计与对账） */
export const rate_limit_counters = sqliteTable("rate_limit_counters", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(), // key:{id} | user:{id} | ip:{ip}
  window: text("window").notNull(), // rpm:{epochMinute} | tpm:{epochMinute}
  value: real("value").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const audit_logs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id"),
    actorIp: text("actor_ip"),
    action: text("action").notNull(), // auth.login | key.create | admin.ban_user | ...
    targetType: text("target_type"),
    targetId: text("target_id"),
    meta: text("meta"), // JSON，禁止写入明文密钥
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(), // SHA-256(prevHash|id|action|meta|ts) 哈希链
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("audit_time_idx").on(t.createdAt)]
);

export const content_flags = sqliteTable(
  "content_flags",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    apiKeyId: text("api_key_id"),
    requestId: text("request_id"),
    publicModel: text("public_model"),
    rule: text("rule").notNull(), // 命中的规则/审核器标识
    excerptHash: text("excerpt_hash"), // 命中内容 SHA-256 摘要（不存原文）
    excerptMasked: text("excerpt_masked"), // 脱敏片段（可配置关闭）
    status: text("status").notNull().default("pending"), // pending | cleared | confirmed | dismissed
    reviewerId: text("reviewer_id"),
    reviewNote: text("review_note"),
    createdAt: integer("created_at").notNull(),
    reviewedAt: integer("reviewed_at"),
  },
  (t) => [index("flags_status_idx").on(t.status, t.createdAt)]
);

/** 用户封禁/申诉记录（合规要求：可追溯、可申诉） */
export const appeals = sqliteTable("appeals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  targetType: text("target_type").notNull(), // user_ban | key_revoke | content_block
  targetId: text("target_id"),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"), // open | accepted | rejected
  decisionNote: text("decision_note"),
  decidedBy: text("decided_by"),
  createdAt: integer("created_at").notNull(),
  decidedAt: integer("decided_at"),
});

/** 公告（popup=弹窗公告；站内通知=通知铃铛列表） */
export const announcements = sqliteTable("announcements", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  popup: integer("popup").notNull().default(0), // 1=进入网站时弹窗
  enabled: integer("enabled").notNull().default(1),
  createdBy: text("created_by"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** 平台级合规开关（单行配置 key='platform'） */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON
  updatedAt: integer("updated_at").notNull(),
});
