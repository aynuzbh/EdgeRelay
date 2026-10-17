/** GET /api/announcements — 当前有效的公告（登录用户；站内通知与弹窗共用） */
import { defineHandler } from "void";
import type { Env } from "../../src/types";
import { requireUser } from "../../src/auth";
import { errorResponse } from "../../src/errors";
import { json } from "../../src/settings";

export const GET = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    await requireUser(c);
    const { results } = await env.DB.prepare(
      "SELECT id, title, content, popup, created_at FROM announcements WHERE enabled=1 ORDER BY created_at DESC LIMIT 20"
    ).all();
    return json({ announcements: results });
  } catch (err) { return errorResponse(c, err); }
});
