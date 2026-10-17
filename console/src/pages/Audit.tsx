import { useEffect, useState } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import { adminAction, type AuditLog } from "../lib/api";
import { Button, Card, DataTable, useConfirm, useToast, type Col } from "../components/ui";
import { fmtTime } from "../lib/utils";

export default function Audit() {
  const [rows, setRows] = useState<AuditLog[] | null>(null);
  const toast = useToast();
  const { confirm, confirmEl } = useConfirm();
  const load = () => adminAction<{ logs: AuditLog[] }>("list_audit", { limit: 300 }).then((d) => setRows(d.logs)).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); }, []);

  const verify = async () => {
    try {
      const r = await adminAction<{ result: { ok: boolean; brokenAt?: string } }>("verify_audit_chain");
      toast(r.result.ok ? "✓ 哈希链完整，未检测到篡改" : `✗ 链断裂于 ${r.result.brokenAt}`, r.result.ok ? "ok" : "err");
    } catch (e) { toast((e as Error).message, "err"); }
  };

  const cols: Col<AuditLog>[] = [
    { key: "time", label: "时间", sortVal: (r) => r.created_at, render: (r) => <span className="text-xs text-muted">{fmtTime(r.created_at)}</span> },
    { key: "actor", label: "操作人", render: (r) => r.actor_email ?? <code className="text-xs">{r.actor_user_id ?? "系统"}</code> },
    { key: "action", label: "动作", render: (r) => <code className="rounded bg-surface2 px-1.5 py-0.5 text-xs">{r.action}</code> },
    { key: "target", label: "目标", render: (r) => <code className="text-xs text-muted">{r.target_type ? `${r.target_type}:${(r.target_id ?? "").slice(0, 12)}` : "—"}</code> },
    { key: "ip", label: "IP", render: (r) => <code className="text-xs">{r.actor_ip ?? "—"}</code> },
    { key: "ops", label: "操作", render: (r) => (
      <Button variant="ghost" className="!px-2 !py-1 text-xs !text-err" onClick={async (e) => {
        e.stopPropagation();
        if (!(await confirm("删除这条审计日志？删除后将自动重建哈希链。"))) return;
        try { await adminAction("delete_audit_log", { id: r.id }); toast("已删除并重建哈希链"); load(); } catch (err) { toast((err as Error).message, "err"); }
      }}><Trash2 size={12} />删除</Button>
    ) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={verify}><ShieldCheck size={14} />校验链完整性</Button>
        <Button variant="ghost" onClick={load}>刷新</Button>
        <Button variant="ghost" className="!text-err" onClick={async () => {
          if (!(await confirm("清空全部审计日志？此操作不可恢复（哈希链将重新从 GENESIS 开始）。"))) return;
          try { await adminAction("clear_audit_logs", {}); toast("已清空"); load(); } catch (e) { toast((e as Error).message, "err"); }
        }}><Trash2 size={14} />清空全部</Button>
      </div>
      <Card className="p-4">
        {rows === null ? <div className="flex flex-col gap-2">{[...Array(8)].map((_, i) => <div key={i} className="skeleton h-9" />)}</div> : <DataTable cols={cols} rows={rows} page={20} expand={(r) => <pre className="max-h-40 overflow-auto text-xs">{JSON.stringify(JSON.parse(r.meta ?? "{}"), null, 2)}</pre>} />}
      </Card>
          {confirmEl}
    </div>
  );
}