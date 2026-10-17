import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { adminAction, api, type UsageLog } from "../lib/api";
import { Button, Card, DataTable, Field, Input, Select, StatusTag, useConfirm, useToast, type Col } from "../components/ui";
import { downloadCsv, fmtTime } from "../lib/utils";

export default function Usage() {
  const [rows, setRows] = useState<UsageLog[] | null>(null);
  const [total, setTotal] = useState(0);
  const [f, setF] = useState({ status: "", model: "", userId: "", days: "7" });
  const { confirm, confirmEl } = useConfirm();
  const toast = useToast();

  const load = () => {
    setRows(null);
    const since = Math.floor(Date.now() / 1000) - parseInt(f.days, 10) * 86400;
    const q = new URLSearchParams({ limit: "200", ...(f.status && { status: f.status }), ...(f.model && { model: f.model }), ...(f.userId && { userId: f.userId }) });
    api<{ logs: UsageLog[]; total: number }>(`/api/admin/usage/logs?${q}`).then((d) => {
      setTotal(d.total);
      setRows(d.logs.filter((r) => r.created_at > since));
    }).catch(() => setRows([]));
  };
  useEffect(() => { load(); }, []);

  const cols: Col<UsageLog>[] = [
    { key: "time", label: "时间", sortVal: (r) => r.created_at, render: (r) => <span className="text-xs text-muted">{fmtTime(r.created_at)}</span> },
    { key: "user", label: "用户", render: (r) => <code className="text-xs">{r.user_id.slice(0, 8)}…</code> },
    { key: "key", label: "API Key", render: (r) => <code className="text-xs text-muted">{(r as unknown as { api_key_id: string }).api_key_id?.slice(0, 8) ?? "—"}…</code> },
    { key: "model", label: "模型", sortVal: (r) => r.public_model, render: (r) => <span className="font-medium">{r.public_model}</span> },
    { key: "status", label: "状态", render: (r) => <StatusTag value={r.status} /> },
    { key: "http", label: "HTTP", render: (r) => <span className="text-xs">{r.http_status}</span> },
    { key: "latency", label: "耗时", sortVal: (r) => r.latency_ms, render: (r) => <span className="tabular-nums">{r.latency_ms} ms</span> },
    { key: "tokens", label: "Tokens", sortVal: (r) => r.prompt_tokens + r.completion_tokens, render: (r) => <span className="tabular-nums">{r.prompt_tokens} + {r.completion_tokens}</span> },
    { key: "cost", label: "费用", sortVal: (r) => r.cost_usd, render: (r) => r.cost_usd.toFixed(4) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="时间范围">
            <Select value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })}>
              <option value="1">近 24 小时</option><option value="7">近 7 天</option><option value="30">近 30 天</option>
            </Select>
          </Field>
          <Field label="状态">
            <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="">全部</option>{["success", "upstream_error", "content_blocked", "no_route", "insufficient_balance"].map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="模型名"><Input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} placeholder="deepseek-chat" /></Field>
          <Field label="用户 ID"><Input value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} /></Field>
          <Button onClick={load}>查询</Button>
          <Button variant="ghost" className="!text-err" onClick={async () => {
            if (!(await confirm("清空全部用量日志？此操作不可恢复（账单流水不受影响）。"))) return;
            try { await adminAction("clear_usage_logs", {}); toast("已清空"); load(); } catch (e) { toast((e as Error).message, "err"); }
          }}>清空全部日志</Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={() => rows && downloadCsv(`usage-${Date.now()}.csv`,
            ["time", "user", "model", "status", "http", "latency_ms", "prompt_tokens", "completion_tokens", "cost", "request_id"],
            rows.map((r) => [fmtTime(r.created_at), r.user_id, r.public_model, r.status, r.http_status, r.latency_ms, r.prompt_tokens, r.completion_tokens, r.cost_usd, r.request_id]))}>
            <Download size={14} />导出 CSV
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        {rows === null ? <div className="flex flex-col gap-2">{[...Array(8)].map((_, i) => <div key={i} className="skeleton h-9" />)}</div> : (
          <>
            <div className="mb-3 text-xs text-muted">最近 {rows.length} 条 / 命中 {total} 条（时间倒序）</div>
            <DataTable cols={cols} rows={rows} page={14} expand={(r) => (
              <div className="grid grid-cols-2 gap-2 font-mono text-xs text-muted">
                <span>请求 ID：<span className="text-ink">{r.request_id}</span></span>
                <span>Key：{(r as unknown as { api_key_id: string }).api_key_id ?? "—"}</span>
                <span>错误码：{r.error_code ?? "—"}</span>
                <span>重试/切换：{r.attempts} 次{r.stream ? " · 流式" : ""}</span>
                <span>IP：{r.ip}</span>
                <span>供应商：{(r as unknown as { provider_id: string }).provider_id ?? "—"}</span>
                <span className="sm:col-span-2">
                  <Button variant="ghost" className="!px-2 !py-1 text-xs !text-err" onClick={async () => {
                    if (!(await confirm("删除这条用量日志？"))) return;
                    try { await adminAction("delete_usage_log", { id: r.id }); toast("已删除"); load(); } catch (e) { toast((e as Error).message, "err"); }
                  }}>删除该条</Button>
                </span>
              </div>
            )} />
          </>
        )}
      </Card>
          {confirmEl}
    </div>
  );
}