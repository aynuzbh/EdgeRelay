import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, type Me, type SiteInfo } from "./lib/api";
import Layout from "./components/Layout";
import { ToastProvider, useStepUp } from "./components/ui";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Keys from "./pages/Keys";
import Providers from "./pages/Providers";
import Models from "./pages/Models";
import Usage from "./pages/Usage";
import Audit from "./pages/Audit";
import Users from "./pages/Users";
import Profile from "./pages/Profile";
import Invite from "./pages/Invite";
import Announcements from "./pages/Announcements";
import { Dialog, Button } from "./components/ui";
import Settings from "./pages/Settings";

function useSiteInfo() {
  const [site, setSite] = useState<SiteInfo | null>(null);
  useEffect(() => {
    api<SiteInfo>("/api/site").then((s) => {
      setSite(s);
      document.title = `${s.siteName} — AI API 网关控制台`;
      const setMeta = (attr: string, key: string, content: string) => {
        let el = document.head.querySelector(`meta[${attr}="${key}"]`);
        if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
        el.setAttribute("content", content);
      };
      setMeta("name", "description", s.siteDescription);
      setMeta("property", "og:title", s.siteName);
      setMeta("property", "og:description", s.siteDescription);
      setMeta("property", "og:image", s.siteLogoUrl);
      const fav = document.head.querySelector("link[rel=icon]") as HTMLLinkElement | null;
      if (fav) fav.href = s.siteLogoUrl;
    }).catch(() => setSite(null));
  }, []);
  return site;
}

/** 公告弹窗：popup 公告进入控制台时弹出；"下次再说"本会话隐藏，"不再提示"永久隐藏 */
function AnnouncementPopup({ meKey }: { meKey: string }) {
  const [ann, setAnn] = useState<{ id: string; title: string; content: string } | null>(null);
  useEffect(() => {
    api<{ announcements: { id: string; title: string; content: string; popup: number }[] }>("/api/announcements")
      .then((d) => {
        const popup = d.announcements.filter((a) => a.popup === 1).sort((a, b) => b.id.localeCompare(a.id))[0];
        if (!popup) return;
        if (localStorage.getItem(`ann-never-${popup.id}-${meKey}`)) return;
        if (sessionStorage.getItem(`ann-later-${popup.id}-${meKey}`)) return;
        setAnn(popup);
      }).catch(() => {});
  }, [meKey]);
  if (!ann) return null;
  const dismiss = (never: boolean) => {
    (never ? localStorage : sessionStorage).setItem(`${never ? "ann-never" : "ann-later"}-${ann.id}-${meKey}`, "1");
    setAnn(null);
    window.dispatchEvent(new CustomEvent("gw:ann-changed")); // 通知顶栏铃铛重新过滤红点
  };
  return (
    <Dialog open onClose={() => dismiss(false)} title="平台公告" width={480}>
      <h3 className="text-base font-semibold">{ann.title}</h3>
      <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{ann.content}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => dismiss(false)}>下次再说</Button>
        <Button onClick={() => dismiss(true)}>不再提示</Button>
      </div>
    </Dialog>
  );
}

function Shell() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const site = useSiteInfo();
  const nav = useNavigate();
  const { stepUpEl } = useStepUp(); // 全局监听 403 step_up_required，弹出正式二次验证弹窗

  const refresh = () => api<Me>("/api/auth/me").then((m) => { setMe(m); }).finally(() => setReady(true));
  useEffect(() => { refresh(); }, []);

  if (!ready) return null;
  const logout = () => api("/api/auth/logout", "POST", {}).catch(() => {}).finally(() => { setMe(null); nav("/"); });

  return (
    <>
    {stepUpEl}
    {me && <AnnouncementPopup meKey={me.user.id} />}
    <Routes>
      {/* 公开官网 */}
      <Route path="/" element={<Landing site={site} me={me} />} />
      <Route path="/login" element={<Login site={site} onLogin={refresh} />} />
      {/* 控制台 */}
      <Route element={me ? <Layout me={me} site={site} onLogout={logout} /> : <Navigate to="/login" replace />}>
        <Route path="/dashboard" element={me ? <Dashboard /> : <Navigate to="/login" replace />} />
        <Route path="/dashboard/keys" element={me ? <Keys /> : <Navigate to="/login" replace />} />
        <Route path="/dashboard/providers" element={me ? <Providers /> : <Navigate to="/login" replace />} />
        <Route path="/dashboard/models" element={me ? <Models me={me} /> : <Navigate to="/login" replace />} />
        <Route path="/dashboard/usage" element={me ? <Usage /> : <Navigate to="/login" replace />} />
        <Route path="/dashboard/audit" element={me ? <Audit /> : <Navigate to="/login" replace />} />
        <Route path="/dashboard/users" element={me ? <Users /> : <Navigate to="/login" replace />} />
        <Route path="/dashboard/settings" element={me ? <Settings /> : <Navigate to="/login" replace />} />
        <Route path="/dashboard/profile" element={me ? <Profile me={me} onRefresh={refresh} /> : <Navigate to="/login" replace />} />
        <Route path="/dashboard/invite" element={me ? <Invite me={me} /> : <Navigate to="/login" replace />} />
        <Route path="/dashboard/announcements" element={me ? <Announcements /> : <Navigate to="/login" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </ToastProvider>
  );
}
