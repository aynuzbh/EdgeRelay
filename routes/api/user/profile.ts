/**
 * 用户资料
 *  GET  /api/user/profile        — 当前用户完整资料
 *  PATCH /api/user/profile       — 更新昵称/介绍
 *  POST /api/user/profile        — { dataBase64 } 上传头像（R2，≤512KB）
 *  PUT  /api/user/profile        — { oldPassword, newPassword } 修改密码
 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { requireUser } from "../../../src/auth";
import { ApiError, ErrorCode, errorResponse } from "../../../src/errors";
import { hashPassword, verifyPassword } from "../../../src/crypto";
import { json } from "../../../src/settings";
import { audit } from "../../../src/audit";
import { clientIp } from "../../../src/auth";

type UserRow = { id: string; email: string; role: string; nickname: string | null; bio: string | null; avatar_url: string | null };

export const GET = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const u = await requireUser(c);
    const row = await env.DB.prepare("SELECT id, email, role, nickname, bio, avatar_url, tos_accepted_at, created_at FROM users WHERE id=?1")
      .bind(u.id).first<{ id: string; email: string; role: string; nickname: string | null; bio: string | null; avatar_url: string | null; tos_accepted_at: number; created_at: number }>();
    if (!row) throw new ApiError(404, ErrorCode.NOT_FOUND, "用户不存在");
    return json({ profile: { id: row.id, email: row.email, role: row.role, nickname: row.nickname, bio: row.bio, avatarUrl: row.avatar_url, createdAt: row.created_at } });
  } catch (err) { return errorResponse(c, err); }
});

export const PATCH = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const u = await requireUser(c);
    const body = await c.req.json<{ nickname?: string; bio?: string }>();
    const nickname = (body.nickname ?? "").trim();
    const bio = (body.bio ?? "").trim();
    if (nickname.length > 32) throw new ApiError(400, ErrorCode.BAD_REQUEST, "昵称最长 32 字");
    if (bio.length > 200) throw new ApiError(400, ErrorCode.BAD_REQUEST, "介绍最长 200 字");
    await env.DB.prepare("UPDATE users SET nickname=?2, bio=?3, updated_at=?4 WHERE id=?1")
      .bind(u.id, nickname || null, bio || null, Math.floor(Date.now() / 1000)).run();
    await audit(c, { actorUserId: u.id, actorIp: clientIp(c.req), action: "profile.update", targetType: "user", targetId: u.id });
    return json({ ok: true });
  } catch (err) { return errorResponse(c, err); }
});

export const POST = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const u = await requireUser(c);
    const body = await c.req.json<{ dataBase64?: string }>();
    const m = (body.dataBase64 ?? "").match(/^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,(.+)$/);
    if (!m) throw new ApiError(400, ErrorCode.BAD_REQUEST, "仅支持 base64 图片（png/jpeg/webp/svg）");
    const bytes = Uint8Array.from(atob(m[2]!), (ch) => ch.charCodeAt(0));
    if (bytes.length > 2 * 1024 * 1024) throw new ApiError(400, ErrorCode.BAD_REQUEST, "头像过大，请上传 2MB 以内的图片");
    const ext = m[1] === "image/svg+xml" ? "svg" : m[1] === "image/jpeg" ? "jpg" : m[1] === "image/webp" ? "webp" : "png";
    if (!env.STORAGE) throw new ApiError(503, ErrorCode.INTERNAL, "对象存储不可用");
    const version = Math.floor(Date.now() / 1000);
    await env.STORAGE.put(`avatars/${u.id}.${ext}`, bytes);
    const avatarUrl = `/api/user/avatar?v=${version}`;
    await env.DB.prepare("UPDATE users SET avatar_url=?2, updated_at=?3 WHERE id=?1").bind(u.id, avatarUrl, version).run();
    await audit(c, { actorUserId: u.id, actorIp: clientIp(c.req), action: "profile.avatar", targetType: "user", targetId: u.id });
    return json({ ok: true, avatarUrl });
  } catch (err) { return errorResponse(c, err); }
});

export const PUT = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const u = await requireUser(c);
    const body = await c.req.json<{ oldPassword?: string; newPassword?: string }>();
    if (!body.oldPassword || !body.newPassword) throw new ApiError(400, ErrorCode.BAD_REQUEST, "缺少旧密码或新密码");
    if (body.newPassword.length < 10) throw new ApiError(400, ErrorCode.BAD_REQUEST, "新密码至少 10 位");
    const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id=?1").bind(u.id).first<{ password_hash: string }>();
    if (!row || !(await verifyPassword(body.oldPassword, row.password_hash))) {
      throw new ApiError(401, ErrorCode.AUTH_INVALID, "旧密码错误");
    }
    const now = Math.floor(Date.now() / 1000);
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET password_hash=?2, updated_at=?3 WHERE id=?1").bind(u.id, await hashPassword(body.newPassword), now),
      // 其他会话全部下线，保留当前会话
      env.DB.prepare("DELETE FROM sessions WHERE user_id=?1 AND id != ?2").bind(u.id, (c.req.header("cookie") ?? "").match(/gw_session=([^;.]+)/)?.[1] ?? ""),
    ]);
    await audit(c, { actorUserId: u.id, actorIp: clientIp(c.req), action: "profile.password_change", targetType: "user", targetId: u.id });
    return json({ ok: true, message: "密码已更新，其他设备已退出登录" });
  } catch (err) { return errorResponse(c, err); }
});
