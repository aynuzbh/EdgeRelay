/**
 * 每日 00:05：统计昨日邀请排行，向前三名发放奖励
 * 奖励金额在控制台「邀请」页配置（inviteDailyTop1/2/3）
 */
import { defineScheduled } from "void";
import { topup } from "../src/billing";
import { getSettings } from "../src/settings";

export const cron = "5 0 * * *";

export default defineScheduled(async (_controller, env, _ctx) => {
  const c = { env } as never;
  const db = env.DB;
  const s = await getSettings(db);
  const rewards = [s.inviteDailyTop1 ?? 0, s.inviteDailyTop2 ?? 0, s.inviteDailyTop3 ?? 0];
  if (!rewards.some((r) => r > 0)) return;

  const dayEnd = Math.floor(Date.now() / 86400000) * 86400; // 今日 0 点
  const dayStart = dayEnd - 86400;
  const { results } = await db.prepare(
    `SELECT invited_by AS uid, COUNT(*) AS n FROM users
     WHERE invited_by IS NOT NULL AND created_at >= ?1 AND created_at < ?2
     GROUP BY invited_by ORDER BY n DESC LIMIT 3`
  ).bind(dayStart, dayEnd).all<{ uid: string; n: number }>();

  for (let i = 0; i < results.length; i++) {
    const reward = rewards[i];
    if (reward > 0 && results[i].uid) {
      await topup(c, `user:${results[i].uid}`, reward, `邀请排行榜第 ${i + 1} 名奖励（昨日邀请 ${results[i].n} 人）`);
    }
  }
});
