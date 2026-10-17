import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, Gift, Trophy } from "lucide-react";
import { adminAction, api, type Me } from "../lib/api";
import { Button, Card, CopyButton, Field, Input, useToast } from "../components/ui";
import { fmtTime } from "../lib/utils";

type InviteMe = {
  inviteCode: string; invitedCount: number; totalReward: number;
  registerReward: number; inviteReward: number;
  invited: { email: string; nickname: string | null; createdAt: number }[];
};
type AdminData = {
  totalInvited: number;
  ranking: { id: string; email: string; nickname: string | null; invited_count: number }[];
  query: { email: string; invited_count: number }[];
  config: { registerReward: number; inviteReward: number; dailyTop1: number; dailyTop2: number; dailyTop3: number };
};

export default function Invite({ me }: { me: Me }) {
  const isAdmin = me.user.role === "admin";
  const [data, setData] = useState<InviteMe | null>(null);
  const [admin, setAdmin] = useState<AdminData | null>(null);
  const [qEmail, setQEmail] = useState("");
  const [cfg, setCfg] = useState<AdminData["config"] | null>(null);
  const [qrData, setQrData] = useState("");
  const toast = useToast();

  const origin = location.origin;
  const link = data ? `${origin}/#/login?invite=${data.inviteCode}` : "";

  useEffect(() => {
    api<InviteMe>("/api/invite/me").then((d) => { setData(d); if (d.inviteCode) {
      QRCode.toDataURL(link, { width: 360, margin: 1, color: { dark: "#1F2430", light: "#FFFFFF" } }).then(setQrData).catch(() => {});
    } }).catch((e) => toast(e.message, "err"));
    if (isAdmin) api<AdminData>("/api/invite/admin").then((d) => { setAdmin(d); setCfg(d.config); }).catch(() => {});
  }, [isAdmin, link]);

  const downloadPoster = async () => {
    if (!data) return;
    const canvas = document.createElement("canvas");
    canvas.width = 600; canvas.height = 800;
    const ctx = canvas.getContext("2d")!;
    // 背景
    ctx.fillStyle = "#0F172A"; ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = "#F38020"; ctx.fillRect(0, 0, 600, 120);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 34px Inter, sans-serif";
    ctx.fillText("EdgeRelay", 40, 72);
    ctx.font = "16px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillText("合规的边缘 AI API 网关 · 邀请你加入", 40, 100);
    // 标题
    ctx.fillStyle = "#F38020"; ctx.font = "bold 28px sans-serif";
    ctx.fillText("扫码注册，双方都有奖励", 40, 200);
    ctx.fillStyle = "#8A8F9C"; ctx.font = "14px sans-serif";
    if (data.inviteReward > 0 || data.registerReward > 0) {
      ctx.fillText(`新用户注册奖励 ${data.registerReward} 元 · 邀请人每邀一人得 ${data.inviteReward} 元`, 40, 232);
    }
    // 二维码
    if (qrData) {
      const qr = new Image();
      await new Promise((res) => { qr.onload = res; qr.src = qrData; });
      ctx.fillStyle = "#ffffff"; ctx.fillRect(150, 280, 300, 300);
      ctx.drawImage(qr, 170, 300, 260, 260);
    }
    // 邀请码
    ctx.fillStyle = "#E2E5EC"; ctx.font = "20px monospace"; ctx.textAlign = "center";
    ctx.fillText(`邀请码：${data.inviteCode}`, 300, 650);
    ctx.fillStyle = "#6B7280"; ctx.font = "13px sans-serif";
    ctx.fillText("在注册页填入邀请码即可绑定", 300, 685);
    ctx.textAlign = "left";
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png"); a.download = "edgerelay-invite.png"; a.click();
  };

  const saveConfig = async () => {
    if (!cfg) return;
    try {
      await adminAction("set_settings", {
        inviteRegisterReward: +cfg.registerReward || 0, inviteRewardAmount: +cfg.inviteReward || 0,
        inviteDailyTop1: +cfg.dailyTop1 || 0, inviteDailyTop2: +cfg.dailyTop2 || 0, inviteDailyTop3: +cfg.dailyTop3 || 0,
      });
      toast("邀请奖励配置已保存（次日生效于排行榜结算）");
    } catch (e) { toast((e as Error).message, "err"); }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 我的邀请 */}
      <Card className="p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Gift size={16} className="text-brand" />邀请好友</h2>
        <p className="mb-5 text-xs text-muted">分享你的专属链接或海报，好友注册成功后双方自动获得奖励。</p>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Field label="专属邀请链接"><div className="flex gap-2"><Input readOnly value={link} className="font-mono !text-xs" /><CopyButton text={link} label="复制" /></div></Field>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-line bg-surface2 p-3 text-center"><div className="text-xl font-bold text-brand">{data?.invitedCount ?? "—"}</div><div className="text-[11px] text-muted">已邀请人数</div></div>
              <div className="rounded-lg border border-line bg-surface2 p-3 text-center"><div className="text-xl font-bold text-ok">{data ? `${data.totalReward.toFixed(2)}` : "—"}</div><div className="text-[11px] text-muted">累计奖励（元）</div></div>
              <div className="rounded-lg border border-line bg-surface2 p-3 text-center"><div className="text-xl font-bold text-ink">{data ? `+${data.inviteReward}` : "—"}</div><div className="text-[11px] text-muted">每邀一人</div></div>
            </div>
            <div className="flex gap-2">
              <Button onClick={downloadPoster}><Download size={14} />下载邀请海报</Button>
            </div>
            {data && data.invited.length > 0 && (
              <div className="rounded-lg border border-line">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-line bg-surface2 text-left text-muted"><th className="px-3 py-2">已邀请用户</th><th className="px-3 py-2">时间</th></tr></thead>
                  <tbody>{data.invited.map((r, i) => (
                    <tr key={i} className="border-b border-line/50 last:border-0"><td className="px-3 py-2">{r.nickname || r.email}</td><td className="px-3 py-2 text-muted">{fmtTime(r.createdAt)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex items-start justify-center">
            {qrData ? <img src={qrData} alt="邀请二维码" className="w-56 rounded-xl2 border border-line" /> : <div className="skeleton h-56 w-56 rounded-xl2" />}
          </div>
        </div>
      </Card>

      {/* 管理员视图 */}
      {isAdmin && (
        <>
          <Card className="p-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Trophy size={16} className="text-brand" />邀请奖励配置</h2>
            <p className="mb-4 text-xs text-muted">每日排行榜由系统在每天 00:05 自动结算昨日邀请前三名并发放到余额。</p>
            {cfg === null ? <div className="skeleton h-20" /> : (
              <>
                <div className="grid gap-3 sm:grid-cols-5">
                  <Field label="新人注册奖励"><Input type="number" step="0.01" value={cfg.registerReward} onChange={(e) => setCfg({ ...cfg, registerReward: +e.target.value })} /></Field>
                  <Field label="邀请人奖励/人"><Input type="number" step="0.01" value={cfg.inviteReward} onChange={(e) => setCfg({ ...cfg, inviteReward: +e.target.value })} /></Field>
                  <Field label="每日第 1 名"><Input type="number" step="0.01" value={cfg.dailyTop1} onChange={(e) => setCfg({ ...cfg, dailyTop1: +e.target.value })} /></Field>
                  <Field label="每日第 2 名"><Input type="number" step="0.01" value={cfg.dailyTop2} onChange={(e) => setCfg({ ...cfg, dailyTop2: +e.target.value })} /></Field>
                  <Field label="每日第 3 名"><Input type="number" step="0.01" value={cfg.dailyTop3} onChange={(e) => setCfg({ ...cfg, dailyTop3: +e.target.value })} /></Field>
                </div>
                <div className="mt-4"><Button onClick={saveConfig}>保存配置</Button></div>
              </>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Trophy size={16} className="text-brand" />邀请情况（共 {admin?.totalInvited ?? 0} 人被邀请）</h2>
              <div className="flex gap-2">
                <Input placeholder="按邀请人邮箱查询" value={qEmail} onChange={(e) => setQEmail(e.target.value)} className="!w-56" />
                <Button variant="ghost" onClick={() => api<AdminData>(`/api/invite/admin?email=${encodeURIComponent(qEmail)}`).then((d) => { setAdmin(d); setCfg(d.config); })}>查询</Button>
              </div>
            </div>
            {admin === null ? <div className="skeleton h-32" /> : (
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-line bg-surface2 text-left text-xs text-muted">
                  <th className="px-3 py-2">排名</th><th className="px-3 py-2">邀请人</th><th className="px-3 py-2">已邀请人数</th>
                </tr></thead>
                <tbody>{(qEmail ? admin.query.map((q) => ({ email: q.email, nickname: null, invited_count: q.invited_count })) : admin.ranking).map((r, i) => (
                  <tr key={i} className="border-b border-line/50 last:border-0">
                    <td className="px-3 py-2">{i < 3 && !qEmail ? <span className={cn2(i)}>{i + 1}</span> : i + 1}</td>
                    <td className="px-3 py-2">{r.nickname || r.email}</td>
                    <td className="px-3 py-2 font-medium text-brand">{r.invited_count}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
function cn2(i: number) {
  return ["inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/20 font-bold text-amber-500",
    "inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-400/20 font-bold text-zinc-500",
    "inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-700/20 font-bold text-orange-700"][i];
}