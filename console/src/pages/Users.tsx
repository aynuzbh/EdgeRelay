import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { adminAction, type UserRow, type Flag, type Appeal } from "../lib/api";
import { Button, Card, DataTable, Dialog, Field, Input, StatusTag, useConfirm, useToast, type Col } from "../components/ui";
import { fmtTime } from "../lib/utils";

export default function Users() {
  const [tab, setTab] = useState<"users" | "flags" | "appeals">("users");
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [appeals, setAppeals] = useState<Appeal[] | null>(null);
  const [invite, setInvite] = useState<{ open: boolean; email: string; role: string }>({ open: false, email: "", role: "member" });
  const { confirm, confirmEl } = useConfirm();
  const toast = useToast();

  const loadUsers = () => adminAction<{ users: UserRow[] }>("list_users").then((d) => setUsers(d.users)).catch((e) => toast(e.message, "err"));
  const loadFlags = () => adminAction<{ flags: Flag[] }>("flags_queue").then((d) => setFlags(d.flags)).catch(() => setFlags([]));
  const loadAppeals = () => adminAction<{ appeals: Appeal[] }>("appeals_list").then((d) => setAppeals(d.appeals)).catch(() => setAppeals([]));
  useEffect(() => { loadUsers(); }, []);

  const userCols: Col<UserRow>[] = [
    { key: "email", label: "邮箱", sortVal: (r) => r.email, render: (r) => <span className="font-medium">{r.email}</span> },
    { key: "id", label: "ID", render: (r) => <code className="text-xs text-muted">{r.id.slice(0, 8)}…</code> },
    { key: "role", label: "角色", render: (r) => <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">{r.role}</span> },
    { key: "roleV", label: "角色值", render: (r) => <code className="text-xs">{r.role}</code> },
    { key: "status", label: "状态", render: (r) => <StatusTag value={r.status} /> },
    { key: "created", label: "创建时间", sortVal: (r) => r.created_at, render: (r) => <span className="text-xs text-muted">{fmtTime(r.created_at)}</span> },
    { key: "ops", label: "操作", render: (r) => (
      <span className="flex gap-1.5">
        {r.status === "active"
          ? <Button variant="ghost" className="!px-2 !py-1 text-xs !text-err" onClick={async (e) => { e.stopPropagation(); if (await confirm(`封禁 ${r.email}？将同时撤销其全部 Key 并强制下线。`)) { await adminAction("ban_user", { userId: r.id }); toast("已封禁"); loadUsers(); } }}>封禁</Button>
          : <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={async (e) => { e.stopPropagation(); await adminAction("unban_user", { userId: r.id }); toast("已解封"); loadUsers(); }}>解封</Button>}
      </span>
    ) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-full gap-1 overflow-x-auto rounded-lg bg-surface2 p-0.5 sm:w-fit" role="tablist">
        {([["users", "用户"], ["flags", "内容复核队列"], ["appeals", "申诉"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); (k === "flags" ? loadFlags : k === "appeals" ? loadAppeals : loadUsers)(); }}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${tab === k ? "bg-surface text-brand shadow-sm" : "text-muted hover:text-ink"}`}>{l}</button>
        ))}
      </div>

      {tab === "users" && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted">角色：user / admin / finance / auditor（审计员对日志只读）</p>
            <Button onClick={() => setInvite({ open: true, email: "", role: "member" })}><Plus size={14} />邀请成员</Button>
          </div>
          {users === null ? <div className="flex flex-col gap-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-9" />)}</div> : <DataTable cols={userCols} rows={users} />}
        </Card>
      )}

      {tab === "flags" && (
        <Card className="p-4">
          {flags === null ? <div className="skeleton h-40" /> : flags.length === 0 ? <p className="py-8 text-center text-xs text-muted">✓ 复核队列为空。开启内容审核后，命中规则的请求会进入这里。</p> : (
            <DataTable cols={[
              { key: "id", label: "ID", render: (f) => <code className="text-xs">{f.id.slice(0, 8)}…</code> },
              { key: "model", label: "模型", render: (f) => f.public_model ?? "—" },
              { key: "rule", label: "命中规则", render: (f) => <code className="text-xs">{f.rule}</code> },
              { key: "hash", label: "内容摘要", render: (f) => <code className="text-xs text-muted">{(f.excerpt_hash ?? "").slice(0, 16)}…</code> },
              { key: "status", label: "状态", render: (f) => <StatusTag value={f.status} /> },
              { key: "ops", label: "操作", render: (f) => (
                <span className="flex gap-1.5">
                  <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={async () => { await adminAction("resolve_flag", { flagId: f.id, decision: "cleared", note: "" }); toast("已放行"); loadFlags(); }}>放行</Button>
                  <Button variant="ghost" className="!px-2 !py-1 text-xs !text-err" onClick={async () => { await adminAction("resolve_flag", { flagId: f.id, decision: "confirmed", note: "" }); toast("已确认违规"); loadFlags(); }}>确认违规</Button>
                </span>
              ) },
            ] as Col<Flag>[]} rows={flags} />
          )}
        </Card>
      )}

      {tab === "appeals" && (
        <Card className="p-4">
          {appeals === null ? <div className="skeleton h-40" /> : appeals.length === 0 ? <p className="py-8 text-center text-xs text-muted">暂无待处理申诉</p> : (
            <DataTable cols={[
              { key: "id", label: "ID", render: (a) => <code className="text-xs">{a.id.slice(0, 8)}…</code> },
              { key: "type", label: "类型", render: (a) => a.target_type },
              { key: "reason", label: "申诉理由", render: (a) => <span className="line-clamp-1 max-w-md">{a.reason}</span> },
              { key: "status", label: "状态", render: (a) => <StatusTag value={a.status} /> },
              { key: "time", label: "时间", render: (a) => <span className="text-xs text-muted">{fmtTime(a.created_at)}</span> },
              { key: "ops", label: "操作", render: (a) => (
                <span className="flex gap-1.5">
                  <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={async () => { await adminAction("resolve_appeal", { appealId: a.id, decision: "accepted", note: "" }); toast("已受理"); loadAppeals(); }}>受理</Button>
                  <Button variant="ghost" className="!px-2 !py-1 text-xs !text-err" onClick={async () => { await adminAction("resolve_appeal", { appealId: a.id, decision: "rejected", note: "" }); toast("已驳回"); loadAppeals(); }}>驳回</Button>
                </span>
              ) },
            ] as Col<Appeal>[]} rows={appeals} />
          )}
        </Card>
      )}

      <Dialog open={invite.open} onClose={() => setInvite({ ...invite, open: false })} title="邀请组织成员" width={440}>
        <div className="flex flex-col gap-3">
          <Field label="成员邮箱"><Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></Field>
          <Field label="备注">组织成员需先自行注册账号，管理员在此登记后分配组织与角色（MVP 阶段以用户角色为准）。</Field>
        </div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setInvite({ ...invite, open: false })}>取消</Button><Button onClick={() => { toast("已记录邀请（MVP 占位）"); setInvite({ ...invite, open: false }); }}>发送邀请</Button></div>
      </Dialog>
      {confirmEl}
    </div>
  );
}
