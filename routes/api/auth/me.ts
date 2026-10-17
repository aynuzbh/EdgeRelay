/** GET /api/auth/me — 当前用户信息（含资料字段与余额） */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { requireUser } from "../../../src/auth";
import { errorResponse } from "../../../src/errors";
import { getBalance } from "../../../src/billing";
import { json } from "../../../src/settings";

export const GET = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const user = await requireUser(c);
    const row = await env.DB.prepare("SELECT nickname, bio, avatar_url FROM users WHERE id=?1").bind(user.id)
      .first<{ nickname: string | null; bio: string | null; avatar_url: string | null }>();
    const balance = await getBalance(env.DB, `user:${user.id}`);
    return json({ user, nickname: row?.nickname ?? null, bio: row?.bio ?? null, avatarUrl: row?.avatar_url ?? null, balance });
  } catch (err) {
    return errorResponse(c, err);
  }
});
