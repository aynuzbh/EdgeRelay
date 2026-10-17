import { useEffect, useState } from "react";
import { adminAction, type PlatformSettings, type SiteInfo } from "../lib/api";
import { Button, Card, Field, Input, useToast } from "../components/ui";

type SmtpCfg = { enabled: boolean; host: string; port: number; username: string; from: string; passwordSet: boolean };
type OAuthCfg = { github: { enabled: boolean; clientId: string; secretSet: boolean }; google: { enabled: boolean; clientId: string; secretSet: boolean } };

export default function Settings() {
  const [s, setS] = useState<PlatformSettings | null>(null);
  const [site, setSite] = useState<SiteInfo | null>(null);
  const [smtp, setSmtp] = useState<SmtpCfg | null>(null);
  const [smtpPass, setSmtpPass] = useState("");
  const [oauth, setOauth] = useState<OAuthCfg | null>(null);
  const [oauthSecrets, setOauthSecrets] = useState({ gh: "", gg: "" });
  const [webhook, setWebhook] = useState("");
  const toast = useToast();

  useEffect(() => {
    adminAction<{ settings: PlatformSettings }>("get_settings").then((d) => setS(d.settings)).catch((e) => toast(e.message, "err"));
    adminAction<{ smtp: SmtpCfg }>("get_smtp").then((d) => setSmtp(d.smtp)).catch(() => setSmtp(null));
    adminAction<{ oauth: OAuthCfg }>("get_oauth").then((d) => setOauth(d.oauth)).catch(() => setOauth(null));
    fetch("/api/site").then((r) => r.json()).then(setSite).catch(() => {});
  }, []);

  const save = async () => {
    if (!s) return;
    try {
      await adminAction("set_settings", s as Record<string, unknown>);
      toast("设置已保存（已写入审计日志）");
    } catch (e) { toast((e as Error).message, "err"); }
  };
  const set = (k: string, v: unknown) => setS({ ...s!, [k]: v });

  if (!s) return <div className="grid gap-4 md:grid-cols-2">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-44" />)}</div>;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">计费与限流</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="默认 RPM（每 Key）"><Input type="number" value={String(s.defaultRpm ?? 60)} onChange={(e) => set("defaultRpm", +e.target.value)} /></Field>
          <Field label="默认 TPM（每 Key）"><Input type="number" value={String(s.defaultTpm ?? 100000)} onChange={(e) => set("defaultTpm", +e.target.value)} /></Field>
        </div>
        <p className="mt-3 text-xs text-muted">超出限制返回结构化 HTTP 429 与 Retry-After。并发精确控制建议后续升级 Durable Objects。</p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">内容安全</h2>
        <label className="mb-3 flex items-center justify-between text-[13px]">
          启用内容安全审核
          <input type="checkbox" className="h-4 w-4 accent-[#F38020]" checked={!!s.contentModerationEnabled} onChange={(e) => set("contentModerationEnabled", e.target.checked)} />
        </label>
        <label className="mb-3 flex items-center justify-between text-[13px]">
          记录脱敏内容片段（默认关闭，仅存摘要）
          <input type="checkbox" className="h-4 w-4 accent-[#F38020]" checked={!!s.logContentEnabled} onChange={(e) => set("logContentEnabled", e.target.checked)} />
        </label>
        <Field label="外部审核 API（可选，POST {input} → {flagged}）"><Input value={String((s as Record<string, unknown>).MODERATION_API_URL ?? "")} onChange={(e) => set("MODERATION_API_URL", e.target.value)} placeholder="https://..." /></Field>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">注册与合规文本</h2>
        <div className="flex flex-col gap-3">
          <label className="flex items-center justify-between text-[13px]">开放注册
            <input type="checkbox" className="h-4 w-4 accent-[#F38020]" checked={!!s.signupsEnabled} onChange={(e) => set("signupsEnabled", e.target.checked)} />
          </label>
          <label className="flex items-center justify-between text-[13px]">注册强制确认条款/隐私
            <input type="checkbox" className="h-4 w-4 accent-[#F38020]" checked={!!s.requireTosAcceptance} onChange={(e) => set("requireTosAcceptance", e.target.checked)} />
          </label>
          <Field label="服务条款 URL"><Input value={String(s.termsOfServiceUrl ?? "")} onChange={(e) => set("termsOfServiceUrl", e.target.value)} /></Field>
          <Field label="隐私政策 URL"><Input value={String(s.privacyPolicyUrl ?? "")} onChange={(e) => set("privacyPolicyUrl", e.target.value)} /></Field>
          <Field label="审计日志保留天数（≥180）"><Input type="number" value={String(s.auditLogRetentionDays ?? 180)} onChange={(e) => set("auditLogRetentionDays", +e.target.value)} /></Field>
        </div>
      </Card>

      <div className="lg:col-span-2 flex justify-end">
        <Button onClick={save}>保存合规与限流设置</Button>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">Webhook 与安全</h2>
        <Field label="上游事件 Webhook 地址"><Input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://api.obitw.cn/api/webhooks/upstream（X-Webhook-Secret 校验）" /></Field>
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <label className="flex items-center justify-between text-[13px]">
            关闭二次验证（管理操作仅需管理员角色，不再要求重新输入密码）
            <input type="checkbox" className="h-4 w-4 accent-[#F38020]" checked={!!s.stepUpDisabled} onChange={(e) => set("stepUpDisabled", e.target.checked)} />
          </label>
          <label className="flex items-center justify-between text-[13px]">
            保持登录状态（会话 10 年有效，不再 7 天过期）
            <input type="checkbox" className="h-4 w-4 accent-[#F38020]" checked={!!s.persistentSession} onChange={(e) => set("persistentSession", e.target.checked)} />
          </label>
          <p className="text-xs text-muted">⚠️ 关闭二次验证会降低管理接口安全性，建议仅在个人/内网环境使用。「保持登录状态」对之后的新登录生效，已有会话需重新登录一次。</p>
          <div><Button onClick={async () => {
            try {
              await adminAction("set_settings", { stepUpDisabled: !!s.stepUpDisabled, persistentSession: !!s.persistentSession });
              toast("安全选项已保存");
            } catch (err) { toast((err as Error).message, "err"); }
          }}>保存安全设置</Button></div>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-muted">
          <li>API Key 支持强制签名：X-Timestamp + X-Signature（HMAC-SHA256），±300s 防重放窗口</li>
          <li>审计日志哈希链防篡改，建议每日运行「校验链完整性」</li>
        </ul>
      </Card>

      {/* 站点信息（SEO 与品牌） */}
      <Card className="p-5 lg:col-span-2">
        <h2 className="mb-1 text-sm font-semibold">站点信息</h2>
        <p className="mb-4 text-xs text-muted">用于各页面 SEO 与控制台品牌；此卡片独立保存。</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="站点名称"><Input value={String(s.siteName ?? "")} onChange={(e) => set("siteName", e.target.value)} /></Field>
          <Field label="站点主页（可选，用于 Logo 跳转）"><Input value={String(s.siteHomepage ?? "")} onChange={(e) => set("siteHomepage", e.target.value)} placeholder="https://..." /></Field>
          <div className="md:col-span-2"><Field label="站点描述（meta description / og:description）">
            <textarea className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink focus:border-brand focus:outline-none" rows={2}
              value={String(s.siteDescription ?? "")} onChange={(e) => set("siteDescription", e.target.value)} />
          </Field></div>
          <div className="flex items-center gap-4">
            {site?.siteLogoUrl && <img src={site.siteLogoUrl} alt="当前 Logo" className="h-12 w-12 rounded-lg border border-line object-contain" />}
            <label className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-[13px] hover:bg-surface2">
              上传新 Logo（自动压缩）
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return;
                try {
                  // 压缩到 256×256 以内，兼容任意尺寸照片
                  const url = URL.createObjectURL(file);
                  const img = new Image();
                  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("无法读取该图片")); img.src = url; });
                  URL.revokeObjectURL(url);
                  const scale = Math.min(1, 256 / Math.max(img.width, img.height));
                  const canvas = document.createElement("canvas");
                  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
                  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                  await adminAction("upsert_site_logo", { dataBase64: canvas.toDataURL("image/png") });
                  toast("Logo 已更新（R2 存储）"); location.reload();
                } catch (err) { toast((err as Error).message, "err"); }
              }} />
            </label>
            <span className="text-xs text-muted">当前：{String(s.siteLogoUrl ?? "/logo.png")}</span>
          </div>
        </div>
        <div className="mt-4"><Button onClick={save}>保存站点信息</Button></div>
      </Card>

      {/* 登录方式：SMTP */}
      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold">SMTP 邮件（密码重置验证码）</h2>
        <p className="mb-4 text-xs text-muted">此卡片独立保存，与「合规与限流」互不影响。</p>
        {smtp === null ? <div className="skeleton h-32" /> : (
          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between text-[13px]">启用 SMTP
              <input type="checkbox" className="h-4 w-4 accent-[#F38020]" checked={smtp.enabled} onChange={(e) => setSmtp({ ...smtp, enabled: e.target.checked })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SMTP 主机"><Input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.example.com" /></Field>
              <Field label="端口（465=TLS / 587=STARTTLS）"><Input type="number" value={String(smtp.port)} onChange={(e) => setSmtp({ ...smtp, port: +e.target.value || 465 })} placeholder="推荐 587" /></Field>
              <Field label="用户名（完整邮箱地址）"><Input value={smtp.username} onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} placeholder="mail@collegehub.cn" /></Field>
              <Field label={`密码${smtp.passwordSet ? "（已设置，留空保持不变）" : ""}`}><Input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} /></Field>
            </div>
            <Field label="发件人地址（From）"><Input value={smtp.from} onChange={(e) => setSmtp({ ...smtp, from: e.target.value })} placeholder="noreply@example.com" /></Field>
            <div><Button onClick={async () => {
              try {
                await adminAction("set_smtp", { enabled: smtp.enabled, host: smtp.host, port: smtp.port, username: smtp.username, from: smtp.from, ...(smtpPass ? { password: smtpPass } : {}) });
                toast("SMTP 配置已保存（密码加密存储）"); setSmtpPass("");
              } catch (err) { toast((err as Error).message, "err"); }
            }}>保存 SMTP 配置</Button></div>
          </div>
        )}
      </Card>

      {/* 登录方式：OAuth */}
      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold">OAuth 登录（GitHub / Google）</h2>
        <p className="mb-4 text-xs text-muted">此卡片独立保存；密钥加密存储。保存后不会被其他卡片的保存操作覆盖。</p>
        {oauth === null ? <div className="skeleton h-32" /> : (
          <div className="flex flex-col gap-4">
            {(["github", "google"] as const).map((p) => (
              <div key={p} className="rounded-lg border border-line p-3">
                <label className="mb-2 flex items-center justify-between text-[13px] font-medium">
                  启用 {p === "github" ? "GitHub" : "Google"} 登录
                  <input type="checkbox" className="h-4 w-4 accent-[#F38020]" checked={oauth[p].enabled} onChange={(e) => setOauth({ ...oauth, [p]: { ...oauth[p], enabled: e.target.checked } })} />
                </label>
                <div className="grid gap-2.5">
                  <Field label="Client ID"><Input value={oauth[p].clientId} onChange={(e) => setOauth({ ...oauth, [p]: { ...oauth[p], clientId: e.target.value } })} /></Field>
                  <Field label={`Client Secret${oauth[p].secretSet ? "（已设置，留空保持不变）" : ""}`}>
                    <Input type="password" value={p === "github" ? oauthSecrets.gh : oauthSecrets.gg}
                      onChange={(e) => setOauthSecrets({ ...oauthSecrets, [p === "github" ? "gh" : "gg"]: e.target.value })} />
                  </Field>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted">回调地址（在 GitHub/Google OAuth 应用中配置）：<code>{location.origin}/api/auth/oauth?provider=github|google&callback=1</code> · 密钥加密存储，仅登录流程内存解密。</p>
            <div><Button onClick={async () => {
              try {
                await adminAction("set_oauth", {
                  githubEnabled: oauth.github.enabled, googleEnabled: oauth.google.enabled,
                  githubClientId: oauth.github.clientId, googleClientId: oauth.google.clientId,
                  ...(oauthSecrets.gh ? { githubClientSecret: oauthSecrets.gh } : {}),
                  ...(oauthSecrets.gg ? { googleClientSecret: oauthSecrets.gg } : {}),
                });
                toast("OAuth 配置已保存"); setOauthSecrets({ gh: "", gg: "" });
              } catch (err) { toast((err as Error).message, "err"); }
            }}>保存 OAuth 配置</Button></div>
          </div>
        )}
      </Card>

    </div>
  );
}
