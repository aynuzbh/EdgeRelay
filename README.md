# AI Gateway MVP — 合规的 AI API 中转/聚合网关

> 技术栈：Void SDK + TypeScript + Cloudflare Workers + D1 (Drizzle) + KV + AI Gateway（可选 R2 归档）

统一的 OpenAI 兼容接口，聚合多家**持有合法授权**的上游模型供应商，提供认证、路由与故障转移、计费、限流、审计与内容安全。

## ⚠️ 合规红线（读我）

1. **只接入你拥有合法代理/分销/再许可授权的上游供应商**。`providers` 表强制登记 `authorization_ref`（授权协议编号）与有效期。
2. 本项目**不实现也不应被改造为**：号池、账号拆分共享、盗用 API Key、绕过地域限制、伪造模型标识。模型映射仅为"统一命名 + 多供应商路由"，每个对外模型始终路由到其声明的真实上游模型。
3. **面向公众提供生成式 AI 服务前**（尤以中国大陆为例），你必须完成：ICP 备案/许可、生成式人工智能服务备案与安全评估（依据《生成式人工智能服务管理暂行办法》）、内容审核机制、算法备案（如适用）、个人信息保护合规（PIPL）。其他司法辖区请类比完成相应备案与评估。
4. 内置合规开关（`settings` 表 / `/api/admin/actions set_settings`）：服务条款确认、隐私政策、审计日志（哈希链防篡改，保留 ≥180 天）、内容安全审核钩子、用户封禁与申诉记录。

## 部署记录（2026-10-17）

- 站点品牌：**EdgeRelay** — "部署在 Cloudflare 边缘的AI API 网关，用统一 OpenAI 兼容接口接入、路由和派发多家大模型服务。"
  - 站点信息（名称/描述/Logo/主页）可在控制台「设置 → 站点信息」配置，实时生效于根页 SEO（title/description/og:*/favicon）与登录页、侧边栏品牌
  - Logo：构建资产 `/logo.png`（`console/public/logo.png`），控制台可上传替换（R2 存储，`/api/site/logo` 提供）
- 登录方式（控制台「设置」可配置，密钥 AES-256-GCM 加密存储）：
  - **GitHub / Google OAuth**：标准授权码流程（state 防 CSRF），自动建号/登录；回调地址 `{origin}/api/auth/oauth?provider=github|google&callback=1`
  - **SMTP**：自研 `cloudflare:sockets` SMTP 客户端（465 隐式 TLS / 587 STARTTLS + AUTH LOGIN），当前用于密码重置验证码（`POST /api/auth/reset`，KV 10 分钟有效，防邮箱枚举）
- 线上入口：**https://api.obitw.cn**（自定义域名）
  - `/` — **公开官网 Landing Page**（React + Tailwind：导航毛玻璃/移动抽屉、Hero+代码示例、供应商信任栏、6 大功能、4 档定价、多语言代码示例、合规承诺、FAQ 折叠面板、底部 CTA 与深色页脚；深/浅色主题；根据登录态显示"进入控制台"）
  - `/login` — 登录/注册；`/dashboard/*` — 管理控制台（8 个页面）
  - `/v1/*` — OpenAI 兼容 API；`/api/*` — 平台管理 API
  - 构建链：`console/`（Vite）→ 产物输出 `public/` → Void 打包至 Worker Assets；旧版单文件控制台备份于 `legacy/console-singlefile.html`
- 新增后端接口：`GET /api/admin/usage/trend?days=`、`GET /api/admin/usage/logs`、管理动作 `list_models` / `list_audit` / `list_pricing`
- 权限分层：管理只读操作（列表/统计/审计查询）仅需 admin/auditor 角色；变更操作仍强制 step-up 二次验证
- 合规文本：`/terms.html`《服务条款》与 `/privacy.html`《隐私政策》已上线（源文件 `console/public/`），注册确认与登录页链接均指向站内页面，`settings` 已同步更新
- 已验证：SPA 资源 200、登录/step-up/管理接口、trend/logs/models/audit 数据返回正常、法律页 200、移动端与桌面端截图审查通过（`shots/`）
- 资源：D1 `ai-gateway-mvp-db`、KV、R2 `ai-gateway-mvp-storage`；迁移与 `db/seed.sql` 已执行
- 管理员：`2178523692@qq.com`（首次登录后请改密）
- 部署方式：受限网络下 Void readiness 探测不可用，采用 `npx vite build && cd dist/ssr && npx wrangler deploy`（控制台改动需先在 `console/` 内 `npx vite build`）
- 生产 secrets 备份：部署机 `/root/secrets/ai-gateway.env`（丢失将无法解密上游密钥）

## 快速开始

> 环境要求：Node.js ≥ 22.18（`env.ts` 依赖 Node 原生 TS 类型剥离；低版本可设 `NODE_OPTIONS=--experimental-strip-types`）。

```bash
npm install
npx void init          # 选择 Cloudflare，自动创建 D1/KV 绑定
npm run dev            # 本地开发（void 自动提供本地 D1/KV）
```

生产部署：

```bash
void secret put ENCRYPTION_KEY        # 32+ 字节随机串（AES-256-GCM 主密钥）
void secret put SESSION_SECRET        # 会话签名密钥
void secret put ADMIN_BOOTSTRAP_TOKEN # 可选：webhook 校验用
void deploy                           # 构建并自动应用 db/migrations
```

初始化数据：

```bash
npx wrangler d1 execute <DB_NAME> --file=./db/seed.sql --remote   # 示例供应商/模型/定价
```

配置变量（见 `env.ts`）：`CF_ACCOUNT_ID` + `AI_GATEWAY_ID`（启用 AI Gateway）、`CORS_ORIGINS`（逗号分隔白名单）、`MODERATION_API_URL`（外部内容审核 API）。

## 创建第一个管理员

```bash
# 1. 注册用户
curl -X POST https://<your-worker>/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"a-strong-passw0rd","tosAccepted":true,"privacyAccepted":true}'
# 2. 在 D1 控制台将其 role 升级为 admin：
#    UPDATE users SET role='admin' WHERE email='admin@example.com';
```

## 使用流程

1. **登录**：`POST /api/auth/login`（Cookie 会话）
2. **创建 Key**：`POST /api/keys`（明文仅返回一次；支持额度/过期/IP 白名单/模型白名单/强制签名）
3. **充值**：管理员 `POST /api/admin/actions {"action":"topup","payload":{"scope":"user:<id>","amount":100}}`
4. **调用**：

```bash
curl https://<your-worker>/v1/chat/completions \
  -H "Authorization: Bearer sk-gw-xxxx" \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"你好"}]}'

# 流式
curl -N ... -d '{"model":"gpt-4o","stream":true,"messages":[...]}'

# 强制签名的 Key（防重放/防篡改）：
#   X-Timestamp: <unix 秒>   X-Signature: HMAC-SHA256("<ts>.<raw body>", sk-gw-xxxx)
```

## API 一览

| 路由 | 说明 |
| --- | --- |
| `POST /v1/chat/completions` | OpenAI 兼容对话（流式/非流式，故障转移，计费） |
| `GET /v1/models` | 对外模型列表 |
| `POST /api/auth/register|login|logout|stepup` | 注册/登录/登出/管理二次验证 |
| `GET /api/auth/me` | 当前用户与余额 |
| `GET/POST /api/keys` | Key 列表/创建（哈希存储，只显示前缀） |
| `POST /api/keys/actions` | Key 撤销/轮换 |
| `GET /api/billing/balance` `/api/billing/ledger?format=csv` | 余额 / 账单导出 |
| `POST /api/appeals` `GET /api/appeals` | 申诉提交/进度 |
| `POST /api/admin/actions` | 管理操作（需 step-up 二次验证） |
| `GET /api/admin/stats` | 实时用量、错误率（近 24h） |
| `POST /api/webhooks/upstream` | 上游事件回调（secret 校验） |

管理操作（action）：`list_users` `set_role` `ban_user` `unban_user` `list_all_keys` `revoke_any_key` `upsert_provider` `upsert_provider_key` `list_providers` `upsert_model` `set_pricing` `topup` `get_settings` `set_settings` `verify_audit_chain` `flags_queue` `resolve_flag` `appeals_list` `resolve_appeal`

## 安全设计

| 要求 | 实现 |
| --- | --- |
| 密钥不明文入库 | 上游 Key：AES-256-GCM（`ENCRYPTION_KEY` 派生）；平台 Key：仅存 SHA-256 |
| 日志脱敏 | `usage_logs` 仅元数据；`content_flags` 只存摘要/脱敏片段；内容记录默认关闭 |
| 防重放/防篡改 | Key 级可选签名（HMAC-SHA256 over ts+body，±300s 窗口，KV nonce 去重） |
| CORS | 白名单环境变量 `CORS_ORIGINS` |
| 管理接口二次验证 | `/api/auth/stepup`（重新输入密码，10 分钟有效）+ 哈希链审计 |
| 审计防篡改/保留 180 天 | `audit_logs` prev_hash→hash 哈希链，`verify_audit_chain` 可校验；可选 R2 归档 |
| 限流 | KV 计数器：RPM / TPM / 并发；结构化 429 + Retry-After。精确突发控制建议升级 Durable Objects |

## 上游接入（合规要点）

- MVP 统一走各厂商官方 OpenAI 兼容端点（OpenAI/DeepSeek 原生；Anthropic、Google 均提供官方兼容层），通过 `providers.kind=openai_compat` + `extra_headers` 配置。
- 配置 `CF_ACCOUNT_ID` + `AI_GATEWAY_ID` 后自动经 Cloudflare AI Gateway 转发（获得缓存、日志、限速与可观测性）。
- 接入新供应商前：确认授权协议 → `upsert_provider`（登记 `authorization_ref`）→ `upsert_provider_key`（密钥加密入库，审计只记指纹）→ `upsert_model` + `set_pricing`。

## 已知限制（MVP 边界）

- KV 限流为最终一致，精确并发/突发建议迁移 Durable Objects。
- 余额扣减为读-改-写；极高并发下建议改为 D1 条件 UPDATE 或串行队列。
- 未内置前端控制台（管理后台 API 已齐全，可直接接 React/Vue）。
- 组织级计费（org scope）数据模型已就绪，路由策略按组织配置待接入。
- 支付对接（充值自动到账）通过 `/api/webhooks/upstream` 模式或独立 webhook 实现。
