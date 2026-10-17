import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy, X } from "lucide-react";
import { cn } from "../lib/utils";

/* ---------- Button ---------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "soft" };
export function Button({ variant = "primary", className, ...p }: BtnProps) {
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-hover shadow-sm",
    ghost: "bg-surface border border-line text-ink hover:bg-surface2",
    soft: "bg-brand/10 text-brand hover:bg-brand/20",
    danger: "bg-err text-white hover:opacity-90",
  }[variant];
  return <button {...p} className={cn("inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors disabled:opacity-50", styles, className)} />;
}

/* ---------- Inputs ---------- */
export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={cn("w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20", p.className)} />
);
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="relative">
    <select {...p} className={cn("w-full appearance-none rounded-lg border border-line bg-surface px-3 py-2 pr-8 text-[13px] text-ink focus:border-brand focus:outline-none", p.className)} />
    <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
  </div>
);
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex min-w-[150px] flex-1 flex-col gap-1.5"><span className="text-xs font-medium text-muted">{label}</span>{children}</label>;
}

/* ---------- Card ---------- */
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("min-w-0 overflow-hidden rounded-xl2 border border-line bg-surface shadow-card", className)}>{children}</div>;
}

/* ---------- Badge / 状态标签 ---------- */
const TAG: Record<string, string> = {
  success: "bg-ok/10 text-ok", active: "bg-ok/10 text-ok", cleared: "bg-ok/10 text-ok", accepted: "bg-ok/10 text-ok", topup: "bg-ok/10 text-ok", release: "bg-ok/10 text-ok",
  error: "bg-err/10 text-err", banned: "bg-err/10 text-err", failed: "bg-err/10 text-err", revoked: "bg-err/10 text-err", upstream_error: "bg-err/10 text-err", capture: "bg-err/10 text-err", rejected: "bg-err/10 text-err",
  pending: "bg-warn/10 text-warn", content_blocked: "bg-warn/10 text-warn", hold: "bg-warn/10 text-warn", suspended: "bg-warn/10 text-warn", confirmed: "bg-err/10 text-err",
  no_route: "bg-info/10 text-info", insufficient_balance: "bg-warn/10 text-warn",
};
export function StatusTag({ value }: { value: string }) {
  return <span className={cn("inline-block shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", TAG[value] ?? "bg-info/10 text-info")}>{value}</span>;
}

/* ---------- Dialog（ESC 关闭 + 遮罩模糊） ---------- */
export function Dialog({ open, onClose, title, children, width = 520 }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={title}>
      <div className="anim-pop w-full rounded-xl2 border border-line bg-surface shadow-pop" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button className="rounded-md p-1 text-muted hover:bg-surface2 hover:text-ink" onClick={onClose} aria-label="关闭"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Toast（右上角滑入） ---------- */
type Toast = { id: number; msg: string; kind: "ok" | "err" };
const ToastCtx = createContext<(msg: string, kind?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = (msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, msg, kind }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4000);
  };
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { msg: string; type?: "ok" | "err" };
      if (d?.msg) push(d.msg, d.type ?? "ok");
    };
    window.addEventListener("gw:toast", h);
    return () => window.removeEventListener("gw:toast", h);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed right-5 top-20 z-[60] flex w-80 max-w-[calc(100vw-40px)] flex-col gap-2" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={cn("anim-toast flex items-start gap-2 rounded-xl2 border bg-surface px-4 py-3 text-[13px] shadow-pop", t.kind === "ok" ? "border-ok/40" : "border-err/40")}>
            <span className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", t.kind === "ok" ? "bg-ok" : "bg-err")} />
            <span className="break-all">{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Skeleton / Empty ---------- */
export const Skeleton = ({ className }: { className?: string }) => <div className={cn("skeleton h-4 w-full", className)} />;
export function EmptyState({ icon, title, hint, action }: { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <div className="text-muted">{icon}</div>
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="max-w-sm text-xs text-muted">{hint}</div>}
      {action}
    </div>
  );
}

/* ---------- CopyButton ---------- */
export function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface2 hover:text-ink" onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch {
        const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
      }
      setDone(true); setTimeout(() => setDone(false), 1500);
    }}>
      {done ? <Check size={12} className="text-ok" /> : <Copy size={12} />}{done ? "已复制" : label}
    </button>
  );
}

/* ---------- DataTable：排序 + 分页 + 每页条数 ---------- */
export type Col<T> = { key: string; label: string; sortVal?: (r: T) => string | number; render: (r: T) => React.ReactNode };
export function DataTable<T extends { id: string }>({ cols, rows, page = 14, empty, expand }: {
  cols: Col<T>[]; rows: T[]; page?: number; empty?: React.ReactNode; expand?: (r: T) => React.ReactNode;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [size, setSize] = useState(page);
  const [idx, setIdx] = useState(0);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = cols.find((c) => c.key === sort.key);
    if (!col?.sortVal) return rows;
    return [...rows].sort((a, b) => { const x = col.sortVal!(a), y = col.sortVal!(b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
  }, [rows, sort, cols]);
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const cur = Math.min(idx, pages - 1);
  const view = sorted.slice(cur * size, cur * size + size);
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-surface2 text-left text-xs text-muted">
              {cols.map((c) => (
                <th key={c.key} className={cn("whitespace-nowrap px-3.5 py-2.5 font-medium", c.sortVal && "cursor-pointer select-none hover:text-ink")}
                  onClick={() => c.sortVal && setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}>
                  {c.label}{sort?.key === c.key && <span>{sort.dir === 1 ? " ↑" : " ↓"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <React.Fragment key={r.id}>
                <tr className={cn("border-b border-line/60 transition-colors last:border-0 hover:bg-surface2", i % 2 === 1 && "bg-surface2/40", expand && "cursor-pointer")}
                  onClick={() => expand && setOpenRow(openRow === r.id ? null : r.id)}>
                  {cols.map((c) => <td key={c.key} className="whitespace-nowrap px-3.5 py-2.5">{c.render(r)}</td>)}
                </tr>
                {expand && openRow === r.id && <tr className="border-b border-line/60 bg-surface2/60"><td colSpan={cols.length} className="px-5 py-3">{expand(r)}</td></tr>}
              </React.Fragment>
            ))}
            {!view.length && <tr><td colSpan={cols.length}>{empty ?? <EmptyState title="暂无数据" />}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-col gap-2 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5">
          <span>共 {sorted.length} 条</span>
          <span className="flex items-center gap-1">每页
            <Select className="!w-[4.5rem] !py-1" value={size} onChange={(e) => { setSize(+e.target.value); setIdx(0); }} aria-label="每页条数">
              {[10, 14, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>条
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" disabled={cur === 0} onClick={() => setIdx(cur - 1)} className="!px-3 !py-1">上一页</Button>
          <span className="tabular-nums">{cur + 1} / {pages}</span>
          <Button variant="ghost" disabled={cur >= pages - 1} onClick={() => setIdx(cur + 1)} className="!px-3 !py-1">下一页</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Code 块（等宽深底 + 复制） ---------- */
export function CodeBlock({ text }: { text: string }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-lg bg-[#0F1219] px-3.5 py-2.5">
      <code className="break-all font-mono text-xs text-[#E2E5EC]">{text}</code>
      <CopyButton text={text} />
    </div>
  );
}

/* ---------- 确认对话框 ---------- */
export function useConfirm() {
  const [st, setSt] = useState<{ open: boolean; msg: string; resolve?: (v: boolean) => void }>({ open: false, msg: "" });
  const confirm = (msg: string) => new Promise<boolean>((resolve) => setSt({ open: true, msg, resolve }));
  const el = (
    <Dialog open={st.open} onClose={() => { st.resolve?.(false); setSt({ open: false, msg: "" }); }} title="操作确认" width={400}>
      <p className="text-sm">{st.msg}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => { st.resolve?.(false); setSt({ open: false, msg: "" }); }}>取消</Button>
        <Button variant="danger" onClick={() => { st.resolve?.(true); setSt({ open: false, msg: "" }); }}>确认执行</Button>
      </div>
    </Dialog>
  );
  return { confirm, confirmEl: el };
}

/* ---------- StepUp 全局监听（管理接口二次验证：正式弹窗） ---------- */
export function useStepUp() {
  const [open, setOpen] = useState(false);
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const h = () => { setPass(""); setErr(""); setOpen(true); };
    window.addEventListener("gw:stepup", h);
    return () => window.removeEventListener("gw:stepup", h);
  }, []);
  const submit = async () => {
    if (!pass) { setErr("请输入密码"); return; }
    setBusy(true); setErr("");
    try {
      const { api } = await import("../lib/api");
      await api("/api/auth/stepup", "POST", { password: pass });
      setOpen(false);
      window.dispatchEvent(new CustomEvent("gw:toast", { detail: { msg: "二次验证通过，10 分钟内有效", type: "ok" } }));
    } catch (e) {
      setErr((e as Error).message || "密码错误");
    } finally { setBusy(false); }
  };
  const el = (
    <Dialog open={open} onClose={() => setOpen(false)} title="二次验证" width={400}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <p className="mb-3 text-xs text-muted">该操作涉及敏感变更，请重新输入账号密码确认身份。验证通过后 10 分钟内无需重复验证。</p>
        <Field label="密码">
          <Input autoFocus type="password" value={pass} onChange={(e) => { setPass(e.target.value); setErr(""); }}
            autoComplete="current-password" aria-label="二次验证密码" />
        </Field>
        {err && <p className="mt-2 text-xs text-err" role="alert">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>取消</Button>
          <Button type="submit" disabled={busy}>{busy ? "验证中…" : "确认身份"}</Button>
        </div>
      </form>
    </Dialog>
  );
  return { stepUpEl: el };
}
