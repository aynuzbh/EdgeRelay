import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { adminAction } from "../lib/api";
import { Button, Card, Dialog, Field, Input, StatusTag, useConfirm, useToast } from "../components/ui";
import { fmtTime } from "../lib/utils";

type Announcement = { id: string; title: string; content: string; popup: number; enabled: number; created_at: number };

export default function Announcements() {
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [dlg, setDlg] = useState(false);
  const [form, setForm] = useState({ id: "", title: "", content: "", popup: false, enabled: true });
  const { confirm, confirmEl } = useConfirm();
  const toast = useToast();

  const load = () => adminAction<{ announcements: Announcement[] }>("list_announcements").then((d) => setRows(d.announcements)).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) return toast("标题与内容不能为空", "err");
    try {
      await adminAction(form.id ? "update_announcement" : "create_announcement", form);
      toast(form.id ? "公告已更新" : "公告已发布"); setDlg(false); load();
    } catch (e) { toast((e as Error).message, "err"); }
  };
  const del = async (a: Announcement) => {
    if (!(await confirm(`删除公告「${a.title}」？`))) return;
    await adminAction("delete_announcement", { id: a.id }); toast("已删除"); load();
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => { setForm({ id: "", title: "", content: "", popup: false, enabled: true }); setDlg(true); }}><Plus size={14} />发布公告</Button>
      </div>
      <Card className="p-4">
        {rows === null ? <div className="flex flex-col gap-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12" />)}</div> : rows.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted">还没有公告</p>
        ) : rows.map((a) => (
          <div key={a.id} className="border-b border-line/60 py-3 last:border-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{a.title}</span>
                {a.popup ? <span className="shrink-0 whitespace-nowrap rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand">弹窗</span> : null}
                <StatusTag value={a.enabled ? "active" : "pending"} />
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => { setForm({ id: a.id, title: a.title, content: a.content, popup: !!a.popup, enabled: !!a.enabled }); setDlg(true); }}>编辑</Button>
                <Button variant="ghost" className="!px-2 !py-1 text-xs !text-err" onClick={() => del(a)}><Trash2 size={12} /></Button>
              </div>
            </div>
            <p className="mt-1 line-clamp-2 pl-6 text-xs text-muted">{a.content}</p>
            <div className="mt-1.5 pr-1 text-right text-[11px] text-muted">{fmtTime(a.created_at)}</div>
          </div>
        ))}
      </Card>

      <Dialog open={dlg} onClose={() => setDlg(false)} title={form.id ? "编辑公告" : "发布公告"} width={560}>
        <div className="flex flex-col gap-3">
          <Field label="标题"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="内容">
            <textarea className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink focus:border-brand focus:outline-none" rows={5}
              value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </Field>
          <label className="flex items-center justify-between text-[13px]">
            进入网站时弹窗展示
            <input type="checkbox" className="h-4 w-4 accent-[#F38020]" checked={form.popup} onChange={(e) => setForm({ ...form, popup: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between text-[13px]">
            启用（关闭后仅保留记录）
            <input type="checkbox" className="h-4 w-4 accent-[#F38020]" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDlg(false)}>取消</Button>
          <Button onClick={save}>{form.id ? "保存修改" : "发布"}</Button>
        </div>
      </Dialog>
      {confirmEl}
    </div>
  );
}