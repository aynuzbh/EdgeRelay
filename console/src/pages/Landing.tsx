import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BookOpen, Boxes, Check, ChevronDown, Coins, Copy, FileText, Gauge,
  Github as GithubIcon, Globe, KeyRound, Layers, Menu, Moon, ScrollText, Server,
  ShieldCheck, Sun, Terminal, X, Zap,
} from "lucide-react";
import type { Me, SiteInfo } from "../lib/api";
import { cn } from "../lib/utils";

const PROVIDERS = ["OpenAI", "Anthropic", "Google", "DeepSeek", "Meta", "Mistral"];
const FEATURES = [
  { icon: Layers, title: "统一 OpenAI 兼容接口", desc: "一套 /v1/chat/completions 调用所有模型，无需改造现有 SDK，切换模型只改一个字段。" },
  { icon: Gauge, title: "多模型智能路由与故障转移", desc: "按优先级与成本自动选择上游，主路由异常时毫秒级切换备用供应商，业务无感。" },
  { icon: Coins, title: "用量计费与额度管理", desc: "输入/输出分开计价，请求前冻结、完成后结算，余额、流水、账单导出一应俱全。" },
  { icon: Zap, title: "限流与防滥用", desc: "Key 级 RPM/TPM/并发控制，可选请求签名防重放防篡改，超限返回结构化 429。" },
  { icon: ScrollText, title: "审计日志与合规支持", desc: "哈希链防篡改的审计日志保留 180 天以上，内容安全审核钩子与人工复核队列。" },
  { icon: Globe, title: "边缘部署，低延迟全球加速", desc: "跑在 Cloudflare 全球边缘节点，就近接入、就近转发，天然高可用。" },
];
const PRICING = [
  { name: "免费版", price: "¥0", unit: "/月", desc: "体验与评估", items: ["$1 体验额度", "全部公开模型", "社区支持"], cta: "免费开始", hot: false },
  { name: "开发者版", price: "按量", unit: "", desc: "个人开发者", items: ["充值即用", "5 RPM 起步", "完整用量分析", "邮件支持"], cta: "开始使用", hot: true },
  { name: "团队版", price: "联系我们", unit: "", desc: "小团队协作", items: ["组织与成员管理", "更高限流配额", "优先故障转移", "专属客服"], cta: "联系销售", hot: false },
  { name: "企业版", price: "定制", unit: "", desc: "规模部署", items: ["私有化/自托管", "SLA 保障", "定制合规方案", "专属供应商协议"], cta: "联系我们", hot: false },
];
const FAQS = [
  { q: "EdgeRelay 和 OneAPI/NewAPI 有什么区别？", a: "EdgeRelay 原生构建在 Cloudflare Workers 边缘：无服务器运维、全球低延迟、与 D1/KV/R2/AI Gateway 深度集成；同时从第一天内置合规能力——哈希链审计日志、内容安全审核队列、上游授权登记，而不是事后补丁。" },
  { q: "支持哪些上游模型？", a: "所有提供 OpenAI 兼容接口的主流供应商：OpenAI、Anthropic、Google、DeepSeek 等。前提是你或平台持有对应的合法授权；新供应商通过控制台几分钟即可接入并配置主备路由。" },
  { q: "如何计费？", a: "按模型的输入/输出 Token 分别计价（每百万 Token 单价）。每次调用前预冻结预估额度，响应后按实际用量结算并解冻差额，全部流水可在控制台导出。" },
  { q: "是否支持自托管？", a: "支持。整个平台就是一套 Cloudflare 项目（Workers + D1 + KV + R2），你可以在自己的 Cloudflare 账户上部署一套完全私有的实例。" },
  { q: "数据隐私如何保障？", a: "平台默认不记录任何对话内容明文，仅保存请求元数据（模型、耗时、Token 数）；上游密钥 AES-256-GCM 加密存储；审计日志哈希链防篡改并支持完整性校验。" },
  { q: "如何开始使用？", a: "注册账号 → 控制台创建 API Key → 把 Base URL 换成 https://api.obitw.cn 即可。整个过程不超过 5 分钟。" },
];

function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  return scrolled;
}

function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === "dark");
  return (
    <button aria-label="切换主题" className="rounded-lg p-2 text-muted transition-colors hover:bg-surface2 hover:text-ink"
      onClick={() => {
        const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        localStorage.setItem("gw-theme", next);
        setDark(next === "dark");
      }}>
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl2 border border-line bg-[#0F1219] shadow-card">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="flex items-center gap-2 font-mono text-[11px] text-zinc-400"><Terminal size={12} />{title}</span>
        <button className="flex items-center gap-1 text-[11px] text-zinc-400 transition-colors hover:text-white"
          onClick={async () => {
            try { await navigator.clipboard.writeText(code); } catch { /* ignore */ }
            setCopied(true); setTimeout(() => setCopied(false), 1500);
          }}>
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}{copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-zinc-200">{code}</pre>
    </div>
  );
}

const CURL = `curl https://api.obitw.cn/v1/chat/completions \\
  -H "Authorization: Bearer sk-gw-****" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "你好"}]
  }'`;

export default function Landing({ site, me }: { site: SiteInfo | null; me: Me | null }) {
  const [menu, setMenu] = useState(false);
  const [faq, setFaq] = useState<number | null>(0);
  const [lang, setLang] = useState<"curl" | "node" | "python">("curl");
  const scrolled = useScrolled();
  const name = site?.siteName ?? "EdgeRelay";
  const logo = site?.siteLogoUrl ?? "/logo.png";

  useEffect(() => { document.title = `${name} — 部署在 Cloudflare 边缘的合规 AI API 网关`; }, [name]);

  const navLinks = [["功能", "#features"], ["模型", "#pricing"], ["定价", "#pricing"], ["文档", "#dev"], ["合规", "#compliance"]] as const;

  const codeSamples = {
    curl: CURL,
    node: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.obitw.cn/v1",
  apiKey: process.env.EDGERELAY_KEY,
});

const res = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: [{ role: "user", content: "你好" }],
});`,
    python: `from openai import OpenAI

client = OpenAI(
    base_url="https://api.obitw.cn/v1",
    api_key="sk-gw-****",
)

res = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "你好"}],
)`,
  };

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* 顶部导航 */}
      <header className={cn("fixed inset-x-0 top-0 z-40 border-b transition-all", scrolled ? "border-line bg-bg/80 shadow-card backdrop-blur-md" : "border-transparent bg-transparent")}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt={name} className="h-8 w-8 rounded-lg object-contain" />
            <span className="text-[15px] font-bold">{name}</span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {navLinks.map(([label, href]) => (
              <a key={label} href={href} className="rounded-lg px-3 py-2 text-[13px] text-muted transition-colors hover:bg-surface2 hover:text-ink">{label}</a>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <ThemeToggle />
            {me ? (
              <Link to="/dashboard"><button className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover">进入控制台</button></Link>
            ) : (<>
              <Link to="/login"><button className="rounded-lg px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-surface2">登录</button></Link>
              <Link to="/login"><button className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover">免费注册</button></Link>
            </>)}
          </div>
          <button className="ml-auto rounded-lg p-2 text-muted hover:bg-surface2 md:hidden" onClick={() => setMenu(!menu)} aria-label="菜单">
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {menu && (
          <div className="border-t border-line bg-surface px-4 py-3 md:hidden">
            {navLinks.map(([label, href]) => (
              <a key={label} href={href} onClick={() => setMenu(false)} className="block rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-surface2">{label}</a>
            ))}
            <div className="mt-2 flex items-center gap-2 border-t border-line pt-3">
              <ThemeToggle />
              {me ? (
                <Link to="/dashboard" className="flex-1"><button className="w-full rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white">进入控制台</button></Link>
              ) : (<>
                <Link to="/login" className="flex-1"><button className="w-full rounded-lg border border-line px-4 py-2 text-[13px]">登录</button></Link>
                <Link to="/login" className="flex-1"><button className="w-full rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white">免费注册</button></Link>
              </>)}
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{
          backgroundImage: "radial-gradient(ellipse 60% 50% at 50% -10%, rgba(243,128,32,.14), transparent), linear-gradient(rgb(var(--c-line)) .5px, transparent .5px), linear-gradient(90deg, rgb(var(--c-line)) .5px, transparent .5px)",
          backgroundSize: "auto, 48px 48px, 48px 48px",
          maskImage: "linear-gradient(to bottom, black 30%, transparent 90%)",
        }} />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
              <Zap size={12} />跑在 Cloudflare 全球边缘节点
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl">
              <span className="text-balance">部署在 Cloudflare 边缘的<span className="text-brand">合规 AI API 网关</span></span>
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted">
              用统一 OpenAI 兼容接口，接入、路由和治理多家大模型服务。合法授权上游、透明计费、哈希链审计——面向开发者与企业的正规聚合分发平台。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={me ? "/dashboard" : "/login"}><button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-6 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-hover hover:shadow-pop">开始使用<ArrowRight size={15} /></button></Link>
              <a href="#dev"><button className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-6 py-3 text-sm font-medium transition-colors hover:bg-surface2">查看文档<BookOpen size={15} /></button></a>
            </div>
          </div>
          <div className="min-w-0"><CodeBlock title="快速开始 — curl" code={CURL} /></div>
        </div>
      </section>

      {/* 信任栏 */}
      <section className="border-y border-line bg-surface py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-center text-xs uppercase tracking-widest text-muted">已支持主流模型供应商 · 均需合法授权接入</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {PROVIDERS.map((p) => (
              <span key={p} className="text-lg font-semibold text-muted opacity-60 grayscale transition-all hover:text-ink hover:opacity-100 hover:grayscale-0">{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* 功能特性 */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight">为什么选择 {name}</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted">从接口、路由、计费到审计，一个平台覆盖 AI API 分发的全部关键环节。</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="group rounded-xl2 border border-line bg-surface p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-pop">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand"><Icon size={19} /></span>
              <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 定价 */}
      <section id="pricing" className="scroll-mt-20 border-y border-line bg-surface py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight">灵活的模型与定价</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted">从个人体验到企业级部署，按需选择，随时升级。</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {PRICING.map((p) => (
              <div key={p.name} className={cn("relative flex flex-col rounded-xl2 border bg-bg p-6 transition-all hover:-translate-y-1", p.hot ? "border-brand shadow-pop ring-1 ring-brand" : "border-line shadow-card")}>
                {p.hot && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-0.5 text-[11px] font-medium text-white">最受欢迎</span>}
                <div className="text-sm font-medium">{p.name}</div>
                <div className="mt-3"><span className="text-3xl font-bold tracking-tight">{p.price}</span><span className="text-sm text-muted">{p.unit}</span></div>
                <div className="mt-1 text-xs text-muted">{p.desc}</div>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {p.items.map((it) => (
                    <li key={it} className="flex items-start gap-2 text-[13px]"><Check size={15} className="mt-0.5 shrink-0 text-ok" />{it}</li>
                  ))}
                </ul>
                <Link to={me ? "/dashboard" : "/login"} className="mt-6">
                  <button className={cn("w-full rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors", p.hot ? "bg-brand text-white hover:bg-brand-hover" : "border border-line bg-surface hover:bg-surface2")}>{p.cta}</button>
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted">所有价格仅为示例，实际以上游供应商授权与平台公示为准。</p>
        </div>
      </section>

      {/* 开发者体验 */}
      <section id="dev" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">为开发者而生</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              任何支持 OpenAI SDK 的语言与框架，改一行 Base URL 即可接入。统一的错误格式、透明的限流响应、原生 SSE 流式转发——不需要学习新的私有协议。
            </p>
            <ul className="mt-6 space-y-3">
              {[
                ["OpenAI 兼容", "/v1/chat/completions、/v1/models，兼容官方 SDK 与生态工具"],
                ["结构化错误", "每个错误都带平台错误码与 request_id，方便定位与工单排查"],
                ["流式响应", "SSE 透传 + 实际 Token 用量捕获，计费精确到次"],
                ["多语言示例", "curl / Node.js / Python 开箱即用"],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <Check size={16} className="mt-0.5 shrink-0 text-brand" />
                  <span className="text-[13px]"><strong className="font-semibold">{t}</strong> — <span className="text-muted">{d}</span></span>
                </li>
              ))}
            </ul>
            <a href="https://api.obitw.cn/terms.html" target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline">
              查看完整文档<FileText size={14} />
            </a>
          </div>
          <div className="min-w-0">
            <div className="mb-3 flex gap-1 rounded-lg bg-surface2 p-0.5" style={{ width: "fit-content" }}>
              {(["curl", "node", "python"] as const).map((l) => (
                <button key={l} onClick={() => setLang(l)} className={cn("rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors", lang === l ? "bg-surface text-brand shadow-sm" : "text-muted hover:text-ink")}>
                  {l === "node" ? "Node.js" : l}
                </button>
              ))}
            </div>
            <CodeBlock title={`${lang} — 调用示例`} code={codeSamples[lang]} />
          </div>
        </div>
      </section>

      {/* 合规与安全 */}
      <section id="compliance" className="scroll-mt-20 border-y border-line bg-surface py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight">合规与安全，从第一天开始</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-muted">EdgeRelay 是正规的 API 聚合与分发平台——不涉及号池、账号拆分、凭证盗用等任何灰产行为。</p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { icon: Server, title: "合法授权上游", desc: "仅接入持有合法代理、分销或再许可授权的供应商，授权协议编号登记入档并可追溯。" },
              { icon: ShieldCheck, title: "内容安全审核", desc: "可配置的内容审核钩子与敏感词规则，命中请求自动拦截并进入人工复核队列。" },
              { icon: KeyRound, title: "数据隐私与审计", desc: "默认不记录对话明文；密钥全链路加密；审计日志哈希链防篡改、保留 180 天以上。" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl2 border border-line bg-bg p-6 shadow-card">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ok/10 text-ok"><Icon size={19} /></span>
                <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight">常见问题</h2>
        <div className="mt-10 space-y-3">
          {FAQS.map((f, i) => (
            <div key={i} className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
              <button className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium" onClick={() => setFaq(faq === i ? null : i)} aria-expanded={faq === i}>
                {f.q}
                <ChevronDown size={16} className={cn("shrink-0 text-muted transition-transform", faq === i && "rotate-180")} />
              </button>
              {faq === i && <p className="border-t border-line px-5 py-4 text-[13px] leading-relaxed text-muted">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* 底部 CTA */}
      <section className="border-t border-line bg-surface py-20">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
          <Boxes aria-hidden className="mx-auto text-brand" size={36} />
          <h2 className="mt-4 text-3xl font-bold tracking-tight">准备好接入边缘 AI 网关了？</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">注册即送体验额度，5 分钟完成第一次调用。</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to={me ? "/dashboard" : "/login"}><button className="rounded-lg bg-brand px-7 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-hover">免费开始</button></Link>
            <a href="mailto:support@obitw.cn"><button className="rounded-lg border border-line bg-surface px-7 py-3 text-sm font-medium transition-colors hover:bg-surface2">联系销售</button></a>
          </div>
        </div>
      </section>

      {/* 页脚 */}
      <footer className="bg-[#0F1219] text-zinc-400">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <img src={logo} alt={name} className="h-7 w-7 rounded-lg object-contain" />
              <span className="text-[15px] font-bold text-white">{name}</span>
            </div>
            <p className="mt-3 max-w-xs text-xs leading-relaxed">部署在 Cloudflare 边缘的合规 AI API 网关，用统一 OpenAI 兼容接口接入、路由和派发多家大模型服务。</p>
          </div>
          {[
            { t: "产品", links: [["功能特性", "#features"], ["模型与定价", "#pricing"], ["进入控制台", "/dashboard"], ["注册账号", "/login"]] },
            { t: "开发者", links: [["快速开始", "#dev"], ["调用示例", "#dev"], ["OpenAI 兼容接口", "https://platform.openai.com/docs/api-reference"]] },
            { t: "合规", links: [["服务条款", "/terms.html"], ["隐私政策", "/privacy.html"], ["内容安全", "#compliance"]] },
          ].map((col) => (
            <div key={col.t}>
              <h4 className="text-[13px] font-semibold text-white">{col.t}</h4>
              <ul className="mt-3 space-y-2.5 text-xs">
                {col.links.map(([l, href]) => (
                  <li key={l}>
                    {href.startsWith("/") || href.startsWith("#")
                      ? <a href={href} className="transition-colors hover:text-white">{l}</a>
                      : <a href={href} target="_blank" rel="noreferrer" className="transition-colors hover:text-white">{l}</a>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 text-[11px] sm:flex-row sm:px-6">
            <span>© {new Date().getFullYear()} {name}. All rights reserved.</span>
            <span className="flex items-center gap-4">
              <a href="/terms.html" className="hover:text-white">服务条款</a>
              <a href="/privacy.html" className="hover:text-white">隐私政策</a>
              <span className="text-zinc-600">备案号：待办理</span>
              <a href="https://github.com" target="_blank" rel="noreferrer" aria-label="GitHub"><GithubIcon size={15} className="hover:text-white" /></a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
