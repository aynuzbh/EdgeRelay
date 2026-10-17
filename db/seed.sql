-- 引导数据（示例）。用法：
--   npx wrangler d1 execute <DB_NAME> --file=./db/seed.sql --remote
-- 或在 void dev 环境用 void db 控制台执行。
-- ⚠️ 上游供应商密钥请勿写在 SQL 里，用管理接口 /api/admin/actions (upsert_provider_key) 加密入库。

-- 1) 上游供应商（均为示例：你必须替换为持有合法授权的真实供应商与端点）
INSERT OR IGNORE INTO providers (id, name, slug, kind, base_url, auth_scheme, extra_headers, status, authorization_ref, created_at) VALUES
  ('p_openai',    'OpenAI',   'openai',    'openai_compat', 'https://api.openai.com',              'bearer',    NULL, 'active', 'YOUR-AUTH-AGREEMENT-REF-001', unixepoch()),
  ('p_anthropic', 'Anthropic','anthropic', 'openai_compat', 'https://api.anthropic.com',           'x-api-key', '{"anthropic-version":"2023-06-01","content-type":"application/json"}', 'active', 'YOUR-AUTH-AGREEMENT-REF-002', unixepoch()),
  ('p_google',    'Google',   'google',    'openai_compat', 'https://generativelanguage.googleapis.com/v1beta/openai', 'bearer', NULL, 'active', 'YOUR-AUTH-AGREEMENT-REF-003', unixepoch()),
  ('p_deepseek',  'DeepSeek', 'deepseek',  'openai_compat', 'https://api.deepseek.com',            'bearer',    NULL, 'active', 'YOUR-AUTH-AGREEMENT-REF-004', unixepoch());

-- 2) 模型映射（public_name 为对外统一名；upstream_model 为上游真实名，绝不对外回显）
--    priority 越小越优先；同优先级取 cost_weight 低者 -> 即实现了主备路由与成本优选
INSERT OR IGNORE INTO models (id, public_name, provider_id, upstream_model, priority, cost_weight, max_context, enabled, created_at) VALUES
  ('m_gpt4o_1',      'gpt-4o',         'p_openai',    'gpt-4o',             10, 1.0, 128000, 1, unixepoch()),
  ('m_gpt4o_2',      'gpt-4o',         'p_openai',    'gpt-4o-2024-11-20',  20, 1.2, 128000, 1, unixepoch()),
  ('m_sonnet_1',     'claude-sonnet',  'p_anthropic', 'claude-sonnet-4-5',  10, 1.0, 200000, 1, unixepoch()),
  ('m_gemini_1',     'gemini-flash',   'p_google',    'gemini-2.0-flash',   10, 1.0, 1000000, 1, unixepoch()),
  ('m_deepseek_1',   'deepseek-chat',  'p_deepseek',  'deepseek-chat',      10, 1.0,  64000, 1, unixepoch()),
  ('m_deepseek_2',   'deepseek-reasoner','p_deepseek','deepseek-reasoner',  10, 1.0,  64000, 1, unixepoch());

-- 3) 定价（单位：货币 / 1M tokens；示例价格，请按你与供应商的实际协议价调整）
INSERT OR IGNORE INTO model_pricing (id, public_name, input_per_million, output_per_million, currency, created_at) VALUES
  ('pr_1', 'gpt-4o',            17.0, 68.0, 'CNY', unixepoch()),
  ('pr_2', 'claude-sonnet',     21.0, 105.0, 'CNY', unixepoch()),
  ('pr_3', 'gemini-flash',      1.0,  4.0, 'CNY', unixepoch()),
  ('pr_4', 'deepseek-chat',     1.0,  4.0, 'CNY', unixepoch()),
  ('pr_5', 'deepseek-reasoner', 3.0, 12.0, 'CNY', unixepoch());

-- 4) 平台合规开关默认值（保守配置；可用管理接口修改）
INSERT INTO settings (key, value, updated_at) VALUES ('platform', json_object(
  'signupsEnabled', true,
  'requireTosAcceptance', true,
  'privacyPolicyUrl', 'https://example.com/privacy',
  'termsOfServiceUrl', 'https://example.com/terms',
  'contentModerationEnabled', false,
  'blocklist', json('[]'),
  'logContentEnabled', false,
  'defaultRpm', 60,
  'defaultTpm', 100000,
  'auditLogRetentionDays', 180
), unixepoch());
