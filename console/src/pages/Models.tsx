import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { adminAction, api, type Me, type ModelRow, type Provider } from "../lib/api";
import { Button, Card, Dialog, DataTable, Field, Input, Select, StatusTag, useConfirm, useToast, type Col } from "../components/ui";

export default function Models({ me }: { me: Me }) {
  const isAdmin = me.user.role === "admin";
  const [rows, setRows] = useState<ModelRow[] | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [dlg, setDlg] = useState(false);
  const [form, setForm] = useState({ publicName: "", providerId: "", upstream: "", priority: "10", cost: "1" });
  const [editing, setEditing] = useState<Record<string, { in: string; out: string }>>({});
  const { confirm, confirmEl } = useConfirm();
  const toast = useToast();

  const load = () => api<{ models: ModelRow[] }>("/api/models").then((d) => setRows(d.models)).catch((e) => toast(e.message, "err"));
  useEffect(() => {
    load();
    if (isAdmin) adminAction<{ providers: Provider[] }>("list_providers").then((d) => setProviders(d.providers)).catch(() => {});
  }, [isAdmin]);

  const save = async () => {
    try {
      await adminAction("upsert_model", { publicName: form.publicName, providerId: form.providerId, upstreamModel: form.upstream, priority: +form.priority || 10, costWeight: +form.cost || 1 });
      toast("映射已保存"); setDlg(false); load();
    } catch (e) { toast((e as Error).message, "err"); }
  };
  const savePrice = async (name: string) => {
    const e = editing[name];
    try {
      await adminAction("set_pricing", { publicName: name, inputPerMillion: parseFloat(e.in), outputPerMillion: parseFloat(e.out), currency: "CNY" });
      toast(`${name} 定价已更新`); load();
    } catch (err) { toast((err as Error).message, "err"); }
  };
  const toggle = async (m: ModelRow) => {
    try {
      await adminAction("upsert_model", { id: m.id, publicName: m.public_name, providerId: "", upstreamModel: m.upstream_model, priority: m.priority, costWeight: m.cost_weight, enabled: !m.enabled });
      toast("已更新状态"); load();
    } catch (e) { toast((e as Error).message, "err"); }
  };
  const remove = async (m: ModelRow) => {
    if (!(await confirm(`删除模型映射「${m.public_name} → ${m.upstream_model}」？`))) return;
    try { await adminAction("delete_model", { id: m.id }); toast("已删除"); load(); } catch (e) { toast((e as Error).message, "err"); }
  };

  const adminCols: Col<ModelRow>[] = [
    { key: "in", label: "输入价 / 1M", render: (r) => (
      <span className="flex items-center gap-1.5">
        <Input className="!w-24 !py-1.5 text-xs" value={editing[r.public_name]?.in ?? String(r.input_per_million ?? "")} onChange={(e) => setEditing({ ...editing, [r.public_name]: { in: e.target.value, out: editing[r.public_name]?.out ?? String(r.output_per_million ?? "") } })} aria-label={`输入价 ${r.public_name}`} />
        <Button variant="soft" className="!h-[34px] !px-2.5 !py-0 text-[11px]" onClick={() => savePrice(r.public_name)}>保存</Button>
      </span>
    ) },
    { key: "out", label: "输出价 / 1M", render: (r) => (
      <Input className="!w-24 !py-1.5 text-xs" value={editing[r.public_name]?.out ?? String(r.output_per_million ?? "")} onChange={(e) => setEditing({ ...editing, [r.public_name]: { in: editing[r.public_name]?.in ?? String(r.input_per_million ?? ""), out: e.target.value } })} aria-label={`输出价 ${r.public_name}`} />
    ) },
    { key: "status", label: "状态", render: (r) => <button onClick={() => toggle(r)} title="点击切换启用/停用"><StatusTag value={r.enabled ? "active" : "pending"} /></button> },
    { key: "ops", label: "操作", render: (r) => (
      <Button variant="ghost" className="!px-2 !py-1 text-xs !text-err" onClick={() => remove(r)}>删除</Button>
    ) },
  ];
  const userCols: Col<ModelRow>[] = [
    { key: "in", label: "输入价 / 1M", render: (r) => r.input_per_million != null ? `${r.input_per_million} ${r.currency ?? "CNY"}` : "未定价" },
    { key: "out", label: "输出价 / 1M", render: (r) => r.output_per_million != null ? `${r.output_per_million} ${r.currency ?? "CNY"}` : "未定价" },
    { key: "status", label: "状态", render: (r) => <StatusTag value={r.enabled ? "active" : "pending"} /> },
  ];

  const cols: Col<ModelRow>[] = [
    { key: "public", label: "对外模型名", sortVal: (r) => r.public_name, render: (r) => <span className="font-medium">{r.public_name}</span> },
    { key: "upstream", label: "上游真实模型", render: (r) => <code className="text-xs">{r.upstream_model}</code> },
    { key: "provider", label: "供应商", render: (r) => r.provider_name ?? "—" },
    { key: "priority", label: "优先级", sortVal: (r) => r.priority, render: (r) => <span className="text-xs">{r.priority}（小=优先）</span> },
    ...(isAdmin ? adminCols : userCols),
  ];

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={() => setDlg(true)}><Plus size={14} />新增映射</Button>
        </div>
      )}
      <Card className="p-4">
        {rows === null ? <div className="flex flex-col gap-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-9" />)}</div> : <DataTable cols={cols} rows={rows} />}
      </Card>

      <Dialog open={dlg} onClose={() => setDlg(false)} title="新增模型映射">
        <div className="grid grid-cols-2 gap-3">
          <Field label="对外统一模型名"><Input value={form.publicName} onChange={(e) => setForm({ ...form, publicName: e.target.value })} placeholder="gpt-4o" /></Field>
          <Field label="供应商">
            <Select value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>
              <option value="">请选择供应商</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.slug}）</option>)}
            </Select>
          </Field>
          <Field label="上游真实模型名"><Input value={form.upstream} onChange={(e) => setForm({ ...form, upstream: e.target.value })} placeholder="gpt-4o" /></Field>
          <Field label="优先级"><Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDlg(false)}>取消</Button><Button onClick={save}>保存</Button></div>
      </Dialog>
      {confirmEl}
    </div>
  );
}
