import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Bell, Boxes, CircleUser, Gauge, Gift, KeyRound, LogOut, Megaphone, Menu, Monitor, Moon, ScrollText, Server, Settings as SettingsIcon, ShieldCheck, Sun, Users, X } from "lucide-react";
import { api, type Me, type SiteInfo } from "../lib/api";
import { cn, fmtMoney } from "../lib/utils";
import { Button, useToast } from "./ui";

const NAV = [
  { to: "/dashboard", label: "仪表盘", icon: Gauge, roles: ["user", "admin", "finance", "auditor"] },
  { to: "/dashboard/keys", label: "API Keys", icon: KeyRound, roles: ["user", "admin", "finance", "auditor"] },
  { to: "/dashboard/providers", label: "供应商", icon: Server, roles: ["admin"] },
  { to: "/dashboard/models", label: "模型与定价", icon: Boxes, roles: ["user", "admin", "finance", "auditor"] },
  { to: "/dashboard/invite", label: "邀请", icon: Gift, roles: ["user", "admin", "finance", "auditor"] },
  { to: "/dashboard/announcements", label: "公告", icon: Megaphone, roles: ["admin"] },
  { to: "/dashboard/usage", label: "用量日志", icon: ScrollText, roles: ["user", "admin", "finance", "auditor"] },
  { to: "/dashboard/audit", label: "审计日志", icon: ShieldCheck, roles: ["admin", "auditor"] },
  { to: "/dashboard/users", label: "用户与组织", icon: Users, roles: ["admin"] },
  { to: "/dashboard/settings", label: "设置", icon: SettingsIcon, roles: ["admin"] },
  { to: "/dashboard/profile", label: "个人主页", icon: CircleUser, roles: ["user", "admin", "finance", "auditor"] },
];

export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem("gw-theme") as "light" | "dark") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("gw-theme", theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")), system: () => { localStorage.removeItem("gw-theme"); setTheme(matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } };
}

type Ann = { id: string; title: string; content: string; popup: number; created_at: number };
export default function Layout({ me, site, onLogout }: { me: Me; site: SiteInfo | null; onLogout: () => void }) {
  const [drawer, setDrawer] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [anns, setAnns] = useState<Ann[]>([]);
  // 公告被"下次再说/不再提示"后重新过滤红点
  const [annTick, setAnnTick] = useState(0);
  useEffect(() => {
    const h = () => setAnnTick((t) => t + 1);
    window.addEventListener("gw:ann-changed", h);
    return () => window.removeEventListener("gw:ann-changed", h);
  }, []);
  useEffect(() => { api<{ announcements: Ann[] }>("/api/announcements").then((d) => setAnns(d.announcements)).catch(() => setAnns([])); }, []);
  // 红点只统计未关闭的公告（与弹窗的"下次再说/不再提示"逻辑一致）
  const meKey = me.user.id;
  void annTick; // 事件触发时强制重算
  const visibleAnns = anns.filter((a) => !localStorage.getItem(`ann-never-${a.id}-${meKey}`) && !sessionStorage.getItem(`ann-later-${a.id}-${meKey}`));
  const bellCount = visibleAnns.length;
  const { theme, toggle } = useTheme();
  const loc = useLocation();
  const toast = useToast();
  useEffect(() => setDrawer(false), [loc.pathname]);

  const nav = (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="主导航">
      {NAV.filter((n) => n.roles.includes(me.user.role)).map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === "/dashboard"} className={({ isActive }) => cn("relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors", isActive ? "bg-brand/10 text-brand" : "text-sidebar-ink hover:bg-surface2 hover:text-ink")}>
          {({ isActive }) => (<>
            {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand" aria-hidden />}
            <Icon size={16} />{label}
          </>)}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex h-screen">
      {/* 桌面侧边栏 */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-sidebar lg:flex">
        <a href="#/" className="flex items-center gap-2 px-5 py-4" title="返回官网">
          {site?.siteLogoUrl ? <img src={site.siteLogoUrl} alt="logo" className="h-7 w-7 rounded-lg object-contain" /> : <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">E</div>}
          <div className="leading-tight"><div className="text-[13px] font-semibold text-ink">{site?.siteName ?? "EdgeRelay"}</div><div className="text-[10px] text-muted">控制台</div></div>
        </a>
        {nav}
        <div className="mt-auto px-5 py-4 text-[11px] text-muted">
          <div>{me.user.email}</div>
          <div>{fmtMoney(me.balance.available, me.balance.currency)}</div>
        </div>
      </aside>

      {/* 移动端抽屉 */}
      {drawer && (
        <div className="anim-fade fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setDrawer(false)}>
          <aside className="h-full w-60 bg-sidebar p-3 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between px-2"><span className="text-sm font-semibold">{site?.siteName ?? "EdgeRelay"}</span>
              <button onClick={() => setDrawer(false)} aria-label="关闭菜单" className="p-1 text-muted"><X size={18} /></button></div>
            {nav}
            <Button variant="ghost" className="mt-4 w-full" onClick={onLogout}><LogOut size={14} />退出登录</Button>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶部栏 */}
        <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:px-6">
          <button className="rounded-lg p-1.5 text-muted hover:bg-surface2 lg:hidden" onClick={() => setDrawer(true)} aria-label="打开菜单"><Menu size={18} /></button>
          <div className="text-sm font-medium">{NAV.filter((n) => n.roles.includes(me.user.role)).find((n) => loc.pathname.startsWith(n.to))?.label ?? "仪表盘"}</div>
          <div className="flex-1" />
          <span className="hidden text-xs text-muted sm:block">{fmtMoney(me.balance.available, me.balance.currency)}（冻结 {me.balance.frozen.toFixed(4)}）</span>
          <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand">{me.user.role}</span>
          <button className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-ink" onClick={toggle} aria-label={theme === "dark" ? "切换浅色模式" : "切换深色模式"}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="hidden rounded-lg p-2 text-muted hover:bg-surface2 hover:text-ink sm:block" onClick={followSystem} aria-label="跟随系统主题">
            <Monitor size={16} />
          </button>
          <button className="relative rounded-lg p-2 text-muted hover:bg-surface2 hover:text-ink" onClick={() => setBellOpen(!bellOpen)} aria-label="站内通知">
            <Bell size={16} />
            {bellCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-err px-1 text-[10px] font-medium text-white">{bellCount}</span>}
          </button>
          <button className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-brand/15 text-xs font-semibold text-brand" title="个人主页"
            onClick={() => { location.hash = "#/dashboard/profile"; }} aria-label="个人主页">
            {me.avatarUrl ? <img src={me.avatarUrl} alt="头像" className="h-full w-full object-cover" /> : me.user.email[0]?.toUpperCase()}
          </button>
          <Button variant="ghost" className="hidden !px-2.5 lg:inline-flex" onClick={onLogout}><LogOut size={14} />退出</Button>
        </header>

        {bellOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setBellOpen(false)} />
            <div className="anim-pop absolute right-4 top-16 z-40 w-80 rounded-xl2 border border-line bg-surface shadow-pop lg:right-6">
              <div className="border-b border-line px-4 py-3 text-sm font-semibold">站内通知</div>
              <div className="max-h-80 overflow-y-auto">
                {visibleAnns.length === 0 ? <p className="py-8 text-center text-xs text-muted">暂无通知</p> : visibleAnns.map((a) => (
                  <div key={a.id} className="border-b border-line/60 px-4 py-3 last:border-0">
                    <div className="text-[13px] font-medium">{a.title}</div>
                    <p className="mt-1 line-clamp-3 text-xs text-muted">{a.content}</p>
                    <div className="mt-1 text-right text-[10px] text-muted">{new Date(a.created_at * 1000).toLocaleString("zh-CN")}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        <main className="mx-auto w-full max-w-[1280px] flex-1 overflow-auto p-4 sm:p-6">
          <Outlet context={{ me }} />
        </main>
      </div>
    </div>
  );
}
function followSystem() {
  localStorage.removeItem("gw-theme");
  document.documentElement.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  location.reload();
}
