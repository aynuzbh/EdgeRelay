/**
 * 审计日志（哈希链防篡改）
 *  - 每条记录 hash = SHA-256(prevHash | id | action | targetId | meta | createdAt)
 *  - 保留期 >= 180 天（settings.auditLogRetentionDays），到期归档到 R2（STORAGE 绑定可选）
 */
import type { Env, HandlerCtx } from "./types";
import { sha256Hex, uuid } from "./crypto";

export type AuditInput = {
  actorUserId?: string | null;
  actorIp?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown>;
};

export async function audit(c: HandlerCtx, input: AuditInput): Promise<void> {
  const db = c.env.DB;
  const id = uuid();
  const createdAt = Math.floor(Date.now() / 1000);
  const last = await db
    .prepare("SELECT hash FROM audit_logs ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .first<{ hash: string }>();
  const prevHash = last?.hash ?? "GENESIS";
  const meta = JSON.stringify(input.meta ?? {});
  const hash = await sha256Hex([prevHash, id, input.action, input.targetId ?? "", meta, createdAt].join("|"));
  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_user_id, actor_ip, action, target_type, target_id, meta, prev_hash, hash, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`
    )
    .bind(
      id,
      input.actorUserId ?? null,
      input.actorIp ?? null,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      meta,
      prevHash,
      hash,
      createdAt
    )
    .run();

  // 可选：同步归档到 R2（对象名含时间与哈希，追加不可变存储策略）
  if (c.env.STORAGE) {
    await c.env.STORAGE.put(
      `audit/${new Date(createdAt * 1000).toISOString().slice(0, 10)}/${id}.json`,
      JSON.stringify({ id, ...input, prevHash, hash, createdAt })
    );
  }
}

/** 校验审计链完整性（管理后台可定期执行） */
export async function verifyAuditChain(db: Env["DB"], limit = 1000): Promise<{ ok: boolean; brokenAt?: string }> {
  const rows = await db
    .prepare("SELECT id, action, target_id, meta, prev_hash, hash, created_at FROM audit_logs ORDER BY created_at ASC, rowid ASC LIMIT ?1")
    .bind(limit)
    .all<{
      id: string; action: string; target_id: string | null; meta: string;
      prev_hash: string | null; hash: string; created_at: number;
    }>();
  let prev = "GENESIS";
  for (const r of rows.results) {
    const expect = await sha256Hex([r.prev_hash, r.id, r.action, r.target_id ?? "", r.meta ?? "{}", r.created_at].join("|"));
    if (expect !== r.hash || r.prev_hash !== prev) return { ok: false, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true };
}

/** 删除审计记录后重建整条哈希链（保证 verifyAuditChain 依然通过） */
export async function rebuildAuditChain(db: Env["DB"]): Promise<number> {
  const { results } = await db
    .prepare("SELECT id, action, target_id, meta, created_at FROM audit_logs ORDER BY created_at ASC, rowid ASC")
    .all<{ id: string; action: string; target_id: string | null; meta: string | null; created_at: number }>();
  let prev = "GENESIS";
  const stmts: D1PreparedStatement[] = [];
  for (const r of results) {
    const hash = await sha256Hex([prev, r.id, r.action, r.target_id ?? "", r.meta ?? "{}", r.created_at].join("|"));
    stmts.push(db.prepare("UPDATE audit_logs SET prev_hash=?2, hash=?3 WHERE id=?1").bind(r.id, prev, hash));
    prev = hash;
  }
  for (let i = 0; i < stmts.length; i += 50) {
    await db.batch(stmts.slice(i, i + 50));
  }
  return stmts.length;
}
