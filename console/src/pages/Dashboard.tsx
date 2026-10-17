import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Coins, ShieldQuestion, Zap } from "lucide-react";
import { api, type Me, type Stats, type TrendPoint, type UsageLog } from "../lib/api";
import { Card, Skeleton, StatusTag, DataTable, type Col } from "../components/ui";
import { fmtInt, fmtMoney, fmtTime } from "../lib/utils";
import { useOutletContext } from "react-router-dom";

const RANGES = [
  { key: 1, label: "24h" }, { key: 7, label: "7d" }, { key: 30, label: "30d" },
];

export default function Dashboard() {
  const { me } = useOutletContext<{ me: Me }>();
  const isAdmin = ["admin", "auditor"].includes(me.user.role);
  const [stats, setStats] = useState<Stats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [range, setRange] = useState(7);
  const [recent, setRecent] = useState<UsageLog[] | null>(null);

  // 管理员看全局数据，普通用户看自己的数据
  useEffect(() => { api<Stats>(isAdmin ? "/api/admin/stats" : "/api/usage/summary").then(setStats).catch(() => setStats(null)); }, [isAdmin]);
  useEffect(() => {
    setTrend(null);
    api<{ points: TrendPoint[] }>(`${isAdmin ? "/api/admin/usage/trend" : "/api/usage/trend"}?days=${range}`).then((d) => setTrend(d.points)).catch(() => setTrend([]));
  }, [range, isAdmin]);
  useEffect(() => {
    api<{ logs: UsageLog[] }>(`${isAdmin ? "/api/admin/usage/logs" : "/api/usage/logs"}?limit=10`).then((d) => setRecent(d.logs)).catch(() => setRecent([]));
  }, [isAdmin]);

  const cards = [
    { label: "我的请求数（24h）", value: stats ? fmtInt(stats.requests) : "", icon: Zap, color: "text-brand bg-brand/10" },
    { label: "我的 Token 消耗（24h）", value: stats ? fmtInt(stats.promptTokens + stats.completionTokens) : "", icon: Coins, color: "text-info bg-info/10" },
    { label: "我的成功率（24h）", value: stats ? `${((1 - stats.errorRate) * 100).toFixed(2)}%` : "", icon: Activity, color: "text-ok bg-ok/10" },
    { label: "当前余额", value: fmtMoney(me.balance.available, me.balance.currency), icon: ShieldQuestion, color: "text-brand bg-brand/10" },
  ];

  const cols: Col<UsageLog>[] = [
    { key: "time", label: "时间", sortVal: (r) => r.created_at, render: (r) => <span className="text-xs text-muted">{fmtTime(r.created_at)}</span> },
    { key: "user", label: "用户", render: (r) => <code className="text-xs">{r.user_id.slice(0, 8)}…</code> },
    { key: "model", label: "模型", render: (r) => <span className="font-medium">{r.public_model}</span> },
    { key: "status", label: "状态", render: (r) => <StatusTag value={r.status} /> },
    { key: "latency", label: "耗时", sortVal: (r) => r.latency_ms, render: (r) => `${r.latency_ms} ms` },
    { key: "tokens", label: "Tokens", sortVal: (r) => r.prompt_tokens + r.completion_tokens, render: (r) => `${r.prompt_tokens} + ${r.completion_tokens}` },
    { key: "cost", label: "费用", render: (r) => r.cost_usd.toFixed(4) },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">{label}</span>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${color}`}><Icon size={16} /></span>
            </div>
            {stats || label === "当前余额" ? <div className="mt-2 truncate text-xl font-bold tabular-nums sm:text-2xl" title={String(value)}>{value}</div> : <Skeleton className="mt-3 h-7 w-24" />}
            <div className="mt-1 text-[11px] text-muted">较昨日 —</div>
          </Card>
        ))}
      </div>

      {/* 趋势图 */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">请求量与 Token 趋势</h2>
          <div className="flex gap-1 rounded-lg bg-surface2 p-0.5" role="tablist" aria-label="时间范围">
            {RANGES.map((r) => (
              <button key={r.key} role="tab" aria-selected={range === r.key} onClick={() => setRange(r.key)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${range === r.key ? "bg-surface text-brand shadow-sm" : "text-muted hover:text-ink"}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-64">
          {trend === null ? <Skeleton className="h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="gReq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F38020" stopOpacity={0.35} /><stop offset="100%" stopColor="#F38020" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gTok" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563EB" stopOpacity={0.3} /><stop offset="100%" stopColor="#2563EB" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-line))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "rgb(var(--c-muted))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "rgb(var(--c-muted))" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "rgb(var(--c-surface))", border: "1px solid rgb(var(--c-line))", borderRadius: 10, fontSize: 12 }} />
                <Area type="monotone" dataKey="requests" name="请求数" stroke="#F38020" strokeWidth={2} fill="url(#gReq)" />
                <Area type="monotone" dataKey="tokens" name="Tokens" stroke="#2563EB" strokeWidth={2} fill="url(#gTok)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-5">
        {/* 模型占比 */}
        <Card className="min-w-0 p-5 xl:col-span-2">
          <h2 className="mb-4 text-sm font-semibold">我的各模型调用占比（24h）</h2>
          <div className="h-56">
            {stats === null ? <Skeleton className="h-full" /> : stats.byModel.length === 0 ? <div className="flex h-full items-center justify-center text-xs text-muted">暂无调用数据</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.byModel} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-line))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "rgb(var(--c-muted))" }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="public_model" width={100} tick={{ fontSize: 11, fill: "rgb(var(--c-muted))" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "rgb(var(--c-surface))", border: "1px solid rgb(var(--c-line))", borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="n" name="请求数" radius={[0, 6, 6, 0]} fill="#F38020" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* 最近请求 */}
        <Card className="min-w-0 p-5 xl:col-span-3">
          <h2 className="mb-4 text-sm font-semibold">我的最近请求</h2>
          {recent === null ? <div className="flex flex-col gap-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9" />)}</div> : (
            <DataTable cols={cols} rows={recent.map((r) => ({ ...r, id: r.id }))} page={10}
              expand={(r) => (
                <div className="grid grid-cols-2 gap-2 text-xs text-muted">
                  <span>请求 ID：<code>{r.request_id}</code></span>
                  <span>上游尝试：{r.attempts} 次{r.stream ? "（流式）" : ""}</span>
                  <span>HTTP {r.http_status} · {r.error_code ?? "—"}</span>
                  <span>IP：{r.ip}</span>
                </div>
              )} />
          )}
        </Card>
      </div>
    </div>
  );
}
