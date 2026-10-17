/** POST /api/auth/logout — 登出 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { errorResponse } from "../../../src/errors";
import { getSessionUser, clearCookie } from "../../../src/auth";
import { json } from "../../../src/settings";

export const POST = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const user = await getSessionUser(c);
    if (user) {
      const cookie = c.req.header("cookie") ?? "";
      const sid = cookie.match(/gw_session=([^;.]+)/)?.[1];
      if (sid) await env.DB.prepare("DELETE FROM sessions WHERE id=?1").bind(sid).run();
    }
    return clearCookie(json({ ok: true }));
  } catch (err) {
    return errorResponse(c, err);
  }
});
