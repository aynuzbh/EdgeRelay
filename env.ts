/**
 * 环境变量与密钥声明（Void SDK 规范格式）
 *
 * - 非敏感变量：可通过 void.config.ts / Cloudflare Dashboard 配置
 * - 敏感密钥：生产环境必须用 `void secret put <NAME>` 设置，禁止提交到仓库
 * - 代码中统一通过 c.env.<NAME> 访问（类型由 Void 生成到 .void/env.d.ts）
 */
import { defineEnv, string } from "void/env";

export default defineEnv({
  // Cloudflare AI Gateway（可选；两者都配置后自动经 AI Gateway 转发上游请求）
  CF_ACCOUNT_ID: string().optional(),
  AI_GATEWAY_ID: string().optional(),
  // CORS 源白名单，逗号分隔，如 https://app.example.com,https://admin.example.com
  CORS_ORIGINS: string().optional(),
  // 可选：外部内容审核 API（POST {input} -> {flagged, rule}）
  MODERATION_API_URL: string().optional(),

  /* ---- 密钥（secrets，用 void secret put 设置） ---- */
  // AES-256-GCM 主密钥（加密上游供应商密钥），建议 32+ 字节随机串
  ENCRYPTION_KEY: string(),
  // 会话 Cookie 签名密钥
  SESSION_SECRET: string(),
  // 可选：上游 webhook 校验令牌
  ADMIN_BOOTSTRAP_TOKEN: string().optional(),
});
