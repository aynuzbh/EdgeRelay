/** GET /api/invite/admin?email= — 邀请总览：排行榜、按用户查询、奖励配置 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { requireUser, requireRole } from "../../../src/auth";
import { errorResponse } from "../../../src/errors";
import { getSettings } from "../../../src/settings";
import { json } from "../../../src/settings";

export const GET = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const u = await requireUser(c);
    requireRole(u, ["admin"]);
    const db = env.DB;
    const email = new URL(c.req.url).searchParams.get("email")?.trim();

    // 排行榜（按邀请人数）
    const ranking = await db.prepare(
      `SELECT u.id, u.email, u.nickname, COUNT(*) AS invited_count
       FROM users t JOIN users u ON u.id = t.invited_by
       WHERE t.invited_by IS NOT NULL
       GROUP BY t.invited_by ORDER BY invited_count DESC LIMIT 20`
    ).all<{ id: string; email: string; nickname: string | null; invited_count: number }>();

    // 按用户查询（邮箱模糊）
    let query: { email: string; invited_count: number }[] = [];
    if (email) {
      query = (await db.prepare(
        `SELECT u.email, COUNT(*) AS invited_count
         FROM users t JOIN users u ON u.id = t.invited_by
         WHERE u.email LIKE ?1 GROUP BY t.invited_by ORDER BY invited_count DESC LIMIT 50`
      ).bind(`%${email}%`).all<{ email: string; invited_count: number }>()).results;
    }

    // 总邀请数
    const total = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE invited_by IS NOT NULL").first<{ n: number }>();

    const s = await getSettings(db);
    return json({
      totalInvited: total?.n ?? 0,
      ranking: ranking.results,
      query,
      config: {
        registerReward: s.inviteRegisterReward ?? 0,
        inviteReward: s.inviteRewardAmount ?? 0,
        dailyTop1: s.inviteDailyTop1 ?? 0,
        dailyTop2: s.inviteDailyTop2 ?? 0,
        dailyTop3: s.inviteDailyTop3 ?? 0,
      },
    });
  } catch (err) { return errorResponse(c, err); }
});
