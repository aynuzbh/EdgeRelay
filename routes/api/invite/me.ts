/** GET /api/invite/me — 我的邀请码、邀请人数、获得奖励、邀请记录 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { requireUser } from "../../../src/auth";
import { errorResponse } from "../../../src/errors";
import { getSettings } from "../../../src/settings";
import { json } from "../../../src/settings";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function genCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const GET = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const u = await requireUser(c);
    // 懒生成邀请码
    let row = await env.DB.prepare("SELECT invite_code FROM users WHERE id=?1").bind(u.id).first<{ invite_code: string | null }>();
    let code = row?.invite_code;
    if (!code) {
      for (let i = 0; i < 5; i++) {
        const candidate = genCode();
        const dup = await env.DB.prepare("SELECT id FROM users WHERE invite_code=?1").bind(candidate).first();
        if (!dup) { code = candidate; break; }
      }
      await env.DB.prepare("UPDATE users SET invite_code=?2 WHERE id=?1").bind(u.id, code).run();
    }
    const s = await getSettings(env.DB);
    const invited = await env.DB.prepare(
      "SELECT email, nickname, created_at FROM users WHERE invited_by=?1 ORDER BY created_at DESC LIMIT 100"
    ).bind(u.id).all<{ email: string; nickname: string | null; created_at: number }>();
    // 我的邀请奖励合计（ledger 备注过滤）
    const rewards = await env.DB.prepare(
      "SELECT COALESCE(SUM(amount),0) AS total FROM ledger_entries WHERE user_id=?1 AND type='topup' AND memo LIKE '邀请奖励%'"
    ).bind(u.id).first<{ total: number }>();
    return json({
      inviteCode: code,
      invitedCount: invited.results.length,
      totalReward: rewards?.total ?? 0,
      registerReward: s.inviteRegisterReward ?? 0,
      inviteReward: s.inviteRewardAmount ?? 0,
      invited: invited.results.map((r) => ({ email: r.email.replace(/^(.).*(@.*)$/, "$1***$2"), nickname: r.nickname, createdAt: r.created_at })),
    });
  } catch (err) { return errorResponse(c, err); }
});
