import { useEffect, useState } from "react";
import { Camera, KeyRound } from "lucide-react";
import { api, type Me } from "../lib/api";
import { Button, Card, Field, Input, useToast } from "../components/ui";

export default function Profile({ me, onRefresh }: { me: Me; onRefresh: () => void }) {
  const [nickname, setNickname] = useState(me.nickname ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(me.avatarUrl ?? "");
  const [pw, setPw] = useState({ old: "", next: "", confirm: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const toast = useToast();

  // 刷新后同步最新资料
  useEffect(() => { setNickname(me.nickname ?? ""); setBio(me.bio ?? ""); setAvatarUrl(me.avatarUrl ?? ""); }, [me]);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api("/api/user/profile", "PATCH", { nickname, bio });
      toast("资料已保存"); onRefresh();
    } catch (e) { toast((e as Error).message, "err"); } finally { setSavingProfile(false); }
  };

  /** 压缩为 256×256 以内的 PNG（自动处理任意尺寸/格式的照片） */
  const compressAvatar = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const size = 256;
        const scale = Math.min(1, size / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("无法读取该图片，请换一张（支持 JPG/PNG/WebP）")); };
      img.src = url;
    });

  const uploadAvatar = async (file: File) => {
    try {
      const b64 = await compressAvatar(file);
      const r = await api<{ avatarUrl: string }>("/api/user/profile", "POST", { dataBase64: b64 });
      setAvatarUrl(r.avatarUrl); toast("头像已更新"); onRefresh();
    } catch (e) { toast((e as Error).message, "err"); }
  };

  const changePw = async () => {
    if (pw.next !== pw.confirm) return toast("两次输入的新密码不一致", "err");
    setSavingPw(true);
    try {
      const r = await api<{ message?: string }>("/api/user/profile", "PUT", { oldPassword: pw.old, newPassword: pw.next });
      toast(r.message ?? "密码已更新"); setPw({ old: "", next: "", confirm: "" });
    } catch (e) { toast((e as Error).message, "err"); } finally { setSavingPw(false); }
  };

  return (
    <div className="grid max-w-3xl gap-5">
      {/* 资料卡 */}
      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold">个人资料</h2>
        <p className="mb-5 text-xs text-muted">昵称与介绍会展示在你的账号信息中。</p>
        <div className="flex items-center gap-5">
          <label className="group relative cursor-pointer">
            <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-brand/15 text-xl font-semibold text-brand">
              {avatarUrl ? <img src={avatarUrl} alt="头像" className="h-full w-full object-cover" /> : me.user.email[0]?.toUpperCase()}
            </span>
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera size={18} className="text-white" />
            </span>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
          </label>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{me.user.email}</div>
            <div className="text-xs text-muted">角色：{me.user.role} · 点击头像更换（自动压缩为 256×256）</div>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label="昵称（最长 32 字）"><Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="未设置" /></Field>
          <Field label="注册邮箱（不可修改）"><Input value={me.user.email} disabled /></Field>
          <div className="sm:col-span-2"><Field label="个人介绍（最长 200 字）">
            <textarea className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink focus:border-brand focus:outline-none" rows={3}
              value={bio} onChange={(e) => setBio(e.target.value)} placeholder="介绍一下自己…" />
          </Field></div>
        </div>
        <div className="mt-4"><Button disabled={savingProfile} onClick={saveProfile}>{savingProfile ? "保存中…" : "保存资料"}</Button></div>
      </Card>

      {/* 密码卡 */}
      <Card className="p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><KeyRound size={15} />修改密码</h2>
        <p className="mb-5 text-xs text-muted">修改成功后其他设备将退出登录，当前会话保持。</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="当前密码"><Input type="password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} autoComplete="current-password" /></Field>
          <Field label="新密码（至少 10 位）"><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="确认新密码"><Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field>
        </div>
        <div className="mt-4"><Button disabled={savingPw} onClick={changePw}>{savingPw ? "提交中…" : "修改密码"}</Button></div>
      </Card>
    </div>
  );
}
