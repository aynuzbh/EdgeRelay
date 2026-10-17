import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, type KeyRow } from "../lib/api";
import { Button, Card, CodeBlock, DataTable, Dialog, Field, Input, Select, StatusTag, useConfirm, useToast, type Col } from "../components/ui";
import { fmtMoney, fmtTime } from "../lib/utils";

export default function Keys() {
  const [rows, setRows] = useState<KeyRow[] | null>(null);
  const [dlg, setDlg] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "default", quota: "", expires: "", ip: "", models: "", sign: false });
  const { confirm, confirmEl } = useConfirm();
  const toast = useToast();

  const load = () => api<{ keys: KeyRow[] }>("/api/keys").then((d) => setRows(d.keys)).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      const body: Record<string, unknown> = { name: form.name || "default", requiresSigning: form.sign };
      if (form.quota) body.quotaUsd = parseFloat(form.quota);
      if (form.expires) body.expiresAt = Math.floor(new Date(form.expires).getTime() / 1000);
      if (form.ip.trim()) body.ipWhitelist = form.ip.split(",").map((s) => s.trim()).filter(Boolean);
      if (form.models.trim()) body.modelWhitelist = form.models.split(",").map((s) => s.trim()).filter(Boolean);
      const r = await api<{ key: string; prefix: string }>("/api/keys", "POST", body);
      setDlg(false); setCreated(r.key); load();
    } catch (e) { toast((e as Error).message, "err"); }
  };
  const revoke = async (id: string) => {
    if (!(await confirm("撤销后该 Key 立即失效且不可恢复，确认撤销？"))) return;
    await api("/api/keys/actions", "POST", { action: "revoke", keyId: id }); toast("已撤销"); load();
  };
  const rotate = async (id: string) => {
    if (!(await confirm("轮换将撤销旧 Key 并生成新 Key，确认？"))) return;
    const r = await api<{ created: { key: string } }>("/api/keys/actions", "POST", { action: "rotate", keyId: id });
    setCreated(r.created.key); load();
  };

  const cols: Col<KeyRow>[] = [
    { key: "name", label: "名称", sortVal: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "prefix", label: "Key 前缀", render: (r) => <code className="rounded bg-surface2 px-1.5 py-0.5 text-xs">{r.prefix}…</code> },
    { key: "created", label: "创建时间", sortVal: (r) => r.created_at, render: (r) => <span className="text-xs text-muted">{fmtTime(r.created_at)}</span> },
    { key: "used", label: "最后使用", sortVal: (r) => r.last_used_at ?? 0, render: (r) => <span className="text-xs text-muted">{fmtTime(r.last_used_at)}</span> },
    { key: "quota", label: "额度", render: (r) => r.quota_usd === null ? "不限" : `${fmtMoney(r.spent_usd)} / ${r.quota_usd}` },
    { key: "status", label: "状态", render: (r) => <StatusTag value={r.status} /> },
    { key: "ops", label: "操作", render: (r) => (
      <span className="flex gap-1.5">
        <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={(e) => { e.stopPropagation(); rotate(r.id); }}>轮换</Button>
        <Button variant="ghost" className="!px-2 !py-1 text-xs !text-err" onClick={(e) => { e.stopPropagation(); revoke(r.id); }}>撤销</Button>
      </span>
    ) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => { setForm({ name: "default", quota: "", expires: "", ip: "", models: "", sign: false }); setDlg(true); }}><Plus size={14} />创建 Key</Button>
      </div>

      <Card className="p-4">
        {rows === null ? <div className="flex flex-col gap-2">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-9" />)}</div> : (
          <DataTable cols={cols} rows={rows.filter((r) => r.status === "active")} />
        )}
      </Card>

      <Dialog open={dlg} onClose={() => setDlg(false)} title="创建 API Key">
        <div className="grid grid-cols-2 gap-3">
          <Field label="名称"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="额度（留空不限）"><Input type="number" step="0.01" value={form.quota} onChange={(e) => setForm({ ...form, quota: e.target.value })} /></Field>
          <Field label="过期时间"><Input type="datetime-local" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} /></Field>
          <Field label="强制签名（防重放）">
            <Select value={form.sign ? "1" : "0"} onChange={(e) => setForm({ ...form, sign: e.target.value === "1" })}>
              <option value="0">关闭</option><option value="1">开启</option>
            </Select>
          </Field>
          <Field label="IP 白名单（逗号分隔）"><Input value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="1.2.3.4,5.6.7.8" /></Field>
          <Field label="模型白名单（逗号分隔）"><Input value={form.models} onChange={(e) => setForm({ ...form, models: e.target.value })} placeholder="deepseek-chat,gpt-4o" /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDlg(false)}>取消</Button><Button onClick={create}>创建</Button></div>
      </Dialog>

      <Dialog open={!!created} onClose={() => setCreated(null)} title="Key 创建成功" width={560}>
        <p className="mb-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">⚠️ 完整 Key 只显示这一次，请立即复制保存。服务端只存哈希，丢失后只能轮换重建。</p>
        <CodeBlock text={created ?? ""} />
        <div className="mt-4 flex justify-end"><Button onClick={() => setCreated(null)}>我已保存</Button></div>
      </Dialog>
      {confirmEl}
    </div>
  );
}
