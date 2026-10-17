/**
 * 计费与额度
 *  - 请求前：按 max_tokens 估算冻结额度（hold），余额不足抛 402
 *  - 响应后：按实际 usage 结算（capture），差额解冻（release）
 *  - 全部变动写 ledger_entries 流水，可对账/导出
 *  - Key 级额度在认证层已检查（api_keys.spent_usd）
 */
import type { Env, HandlerCtx } from "./types";
import { ApiError, ErrorCode } from "./errors";
import { uuid } from "./crypto";
import { billingScope } from "./auth";

export type Pricing = {
  publicName: string;
  inputPerMillion: number;
  outputPerMillion: number;
  currency: string;
};

export function estimateCost(p: Pricing, promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1_000_000) * p.inputPerMillion + (completionTokens / 1_000_000) * p.outputPerMillion;
}

export async function getPricing(db: Env["DB"], publicName: string): Promise<Pricing | null> {
  const row = await db
    .prepare("SELECT public_name, input_per_million, output_per_million, currency FROM model_pricing WHERE public_name=?1")
    .bind(publicName)
    .first<{ public_name: string; input_per_million: number; output_per_million: number; currency: string }>();
  return row
    ? { publicName: row.public_name, inputPerMillion: row.input_per_million, outputPerMillion: row.output_per_million, currency: row.currency }
    : null;
}

export async function getBalance(db: Env["DB"], scope: string): Promise<{ available: number; frozen: number; currency: string }> {
  const row = await db
    .prepare("SELECT available, frozen, currency FROM balances WHERE scope=?1")
    .bind(scope)
    .first<{ available: number; frozen: number; currency: string }>();
  return row ?? { available: 0, frozen: 0, currency: "CNY" };
}

/** 冻结预估额度；不足返回 402 */
export async function hold(c: HandlerCtx, scope: string, amount: number, requestId: string): Promise<{ holdId: string }> {
  if (amount <= 0) return { holdId: "" };
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  // 简单乐观锁：读-改-写，Workers 单请求内足够；高并发可迁移 D1 batch + 条件 UPDATE
  const bal = await getBalance(db, scope);
  if (bal.available - bal.frozen < amount) {
    throw new ApiError(402, ErrorCode.INSUFFICIENT_BALANCE, "余额不足，请充值", {
      available: bal.available,
      frozen: bal.frozen,
      required: amount,
    });
  }
  const holdId = uuid();
  await db.batch([
    db.prepare("UPDATE balances SET frozen = frozen + ?2, updated_at=?3 WHERE scope=?1").bind(scope, amount, now),
    db.prepare(
      `INSERT INTO ledger_entries (id, scope, user_id, type, amount, balance_after, request_id, memo, created_at)
       VALUES (?1,?2,NULL,'hold',?3,?4,?5,?6,?7)`
    ).bind(holdId, scope, amount, bal.available - bal.frozen, requestId, `hold ${amount.toFixed(6)}`, now),
  ]);
  return { holdId };
}

/** 结算：按实际费用 capture，并释放剩余冻结 */
export async function settle(
  c: HandlerCtx,
  args: { scope: string; holdId: string; heldAmount: number; actualCost: number; requestId: string; userId: string; apiKeyId?: string }
): Promise<void> {
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const releaseAmount = Math.max(0, args.heldAmount - args.actualCost);
  const bal = await getBalance(db, args.scope);
  const availableAfter = bal.available - args.actualCost;
  const stmts = [
    db.prepare("UPDATE balances SET available = available - ?2, frozen = MAX(0, frozen - ?3), updated_at=?4 WHERE scope=?1")
      .bind(args.scope, args.actualCost, args.heldAmount, now),
    db.prepare(
      `INSERT INTO ledger_entries (id, scope, user_id, type, amount, balance_after, request_id, memo, created_at)
       VALUES (?1,?2,?3,'capture',?4,?5,?6,?7,?8)`
    ).bind(uuid(), args.scope, args.userId, args.actualCost, availableAfter, args.requestId, `capture ${args.actualCost.toFixed(6)}`, now),
  ];
  if (releaseAmount > 0) {
    stmts.push(
      db.prepare(
        `INSERT INTO ledger_entries (id, scope, user_id, type, amount, balance_after, request_id, memo, created_at)
         VALUES (?1,?2,?3,'release',?4,?5,?6,?7,?8)`
      ).bind(uuid(), args.scope, args.userId, releaseAmount, availableAfter, args.requestId, `release ${releaseAmount.toFixed(6)}`, now)
    );
  }
  if (args.apiKeyId) {
    stmts.push(db.prepare("UPDATE api_keys SET spent_usd = spent_usd + ?2 WHERE id=?1").bind(args.apiKeyId, args.actualCost));
  }
  await db.batch(stmts);
}

/** 请求失败时全额解冻 */
export async function releaseHold(c: HandlerCtx, scope: string, holdId: string, heldAmount: number, requestId: string): Promise<void> {
  if (!holdId || heldAmount <= 0) return;
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare("UPDATE balances SET frozen = MAX(0, frozen - ?2), updated_at=?3 WHERE scope=?1").bind(scope, heldAmount, now),
    db.prepare(
      `INSERT INTO ledger_entries (id, scope, user_id, type, amount, balance_after, request_id, memo, created_at)
       VALUES (?1,?2,NULL,'release',?3,?4,?5,?6,?7)`
    ).bind(uuid(), scope, heldAmount, 0, requestId, `release on failure ${heldAmount.toFixed(6)}`, now),
  ]);
}

/** 充值/调整（管理员或支付回调调用） */
export async function topup(c: HandlerCtx, scope: string, amount: number, memo: string): Promise<void> {
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const bal = await getBalance(db, scope);
  const after = bal.available + amount;
  await db.batch([
    db.prepare("INSERT INTO balances (id, scope, available, frozen, currency, updated_at) VALUES (?1,?2,?3,0,'CNY',?4) ON CONFLICT(scope) DO UPDATE SET available = available + ?3, updated_at=?4")
      .bind(uuid(), scope, amount, now),
    db.prepare(
      `INSERT INTO ledger_entries (id, scope, user_id, type, amount, balance_after, request_id, memo, created_at)
       VALUES (?1,?2,NULL,?3,?4,?5,NULL,?6,?7)`
    ).bind(uuid(), scope, amount >= 0 ? "topup" : "adjustment", amount, after, memo, now),
  ]);
}
