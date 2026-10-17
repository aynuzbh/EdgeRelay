/// <reference types="@cloudflare/workers-types" />

export type Env = {
  DB: D1Database;
  KV: KVNamespace;
  STORAGE?: R2Bucket; // 可选：日志归档
  ENCRYPTION_KEY: string;
  SESSION_SECRET: string;
  ADMIN_BOOTSTRAP_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  CORS_ORIGINS?: string;
  MODERATION_API_URL?: string;
  BILLING_CURRENCY?: string;
};

/** 辅助模块依赖的最小环境结构（避免依赖 void 生成的类型产物，便于单测与复用） */
export type MinimalEnv = {
  DB: D1Database;
  KV: KVNamespace;
  STORAGE?: R2Bucket;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  MODERATION_API_URL?: unknown;
  [key: string]: unknown;
};

/** 结构化最小 Request（与 Hono 的 HonoRequest 兼容；Hono 会缓存 body，可多次 json()/text()） */
export type MinimalReq = {
  url: string;
  method: string;
  header(name: string): string | undefined;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
};

/** 辅助模块的 Handler 上下文参数（与 Hono Context 结构兼容） */
export type HandlerCtx = { env: MinimalEnv; req: MinimalReq };

export type PlatformSettings = {
  signupsEnabled: boolean;
  requireTosAcceptance: boolean;
  privacyPolicyUrl: string;
  termsOfServiceUrl: string;
  contentModerationEnabled: boolean;
  blocklist: string[];
  logContentEnabled: boolean;
  defaultRpm: number;
  defaultTpm: number;
  auditLogRetentionDays: number;
  /* 安全选项 */
  stepUpDisabled?: boolean; // 关闭管理接口二次验证（仅保留 admin 角色校验）
  persistentSession?: boolean; // 保持登录状态（会话 10 年有效）
  /* 邀请奖励 */
  inviteRegisterReward?: number; // 新用户注册奖励
  inviteRewardAmount?: number; // 邀请人每邀一人奖励
  inviteDailyTop1?: number;
  inviteDailyTop2?: number;
  inviteDailyTop3?: number;
  /* 站点信息（SEO + 品牌） */
  siteName?: string;
  siteDescription?: string;
  siteLogoUrl?: string;
  siteHomepage?: string;
  /* 登录方式 */
  oauthGithubEnabled?: boolean;
  oauthGoogleEnabled?: boolean;
  oauthGithubClientId?: string;
  oauthGoogleClientId?: string;
  oauthGithubSecretEnc?: string; // 加密存储
  oauthGoogleSecretEnc?: string;
  smtpEnabled?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpFrom?: string;
  smtpPassEnc?: string; // 加密存储
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  signupsEnabled: true,
  requireTosAcceptance: true,
  privacyPolicyUrl: "/privacy.html",
  termsOfServiceUrl: "/terms.html",
  contentModerationEnabled: false,
  blocklist: [],
  logContentEnabled: false,
  defaultRpm: 60,
  defaultTpm: 100000,
  auditLogRetentionDays: 180,
  stepUpDisabled: false,
  persistentSession: false,
  siteName: "EdgeRelay",
  siteDescription: "部署在 Cloudflare 边缘的AI API 网关，用统一 OpenAI 兼容接口接入、路由和派发多家大模型服务。",
  siteLogoUrl: "/logo.png",
  siteHomepage: "",
};

export type RateLimits = { rpm: number; tpm: number; concurrency: number };

export type UpstreamRoute = {
  modelId: string;
  providerId: string;
  providerSlug: string;
  providerKind: string;
  baseUrl: string;
  authScheme: string;
  extraHeaders: Record<string, string>;
  providerKeyId: string;
  encryptedKey: string;
  upstreamModel: string;
  priority: number;
  costWeight: number;
};

export type AuthedKey = {
  keyId: string;
  userId: string;
  orgId: string | null;
  requiresSigning: boolean;
  ipWhitelist: string[] | null;
  modelWhitelist: string[] | null;
  limits: RateLimits;
};
