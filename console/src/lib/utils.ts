export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export const fmtInt = (n: number | null | undefined) => (n ?? 0).toLocaleString("zh-CN");
export const fmtMoney = (n: number | null | undefined, cur = "CNY") => `${(n ?? 0).toFixed(4)} ${cur}`;
export const fmtTime = (ts: number | null | undefined) => (ts ? new Date(ts * 1000).toLocaleString("zh-CN", { hour12: false }) : "—");
export const fmtDay = (ts: number | null | undefined) => (ts ? new Date(ts * 1000).toLocaleDateString("zh-CN") : "—");

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "\uFEFF" + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
