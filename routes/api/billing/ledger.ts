/** GET /api/billing/ledger?limit=100[&format=csv] — 账单流水查询 / 导出 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { requireUser, billingScope } from "../../../src/auth";
import { errorResponse } from "../../../src/errors";
import { json } from "../../../src/settings";

export const GET = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const user = await requireUser(c);
    const url = new URL(c.req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 1000);
    const { results } = await env.DB.prepare(
      `SELECT id, type, amount, balance_after, request_id, memo, created_at
       FROM ledger_entries WHERE scope=?1 ORDER BY created_at DESC LIMIT ?2`
    )
      .bind(billingScope(user.id, null), limit)
      .all<{ id: string; type: string; amount: number; balance_after: number; request_id: string | null; memo: string | null; created_at: number }>();

    if (url.searchParams.get("format") === "csv") {
      const header = "id,type,amount,balance_after,request_id,memo,created_at";
      const rows = results.map((r) =>
        [r.id, r.type, r.amount.toFixed(6), r.balance_after.toFixed(6), r.request_id ?? "", `"${(r.memo ?? "").replace(/"/g, '""')}"`, new Date(r.created_at * 1000).toISOString()].join(",")
      );
      return new Response([header, ...rows].join("\n"), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="ledger-${user.id}.csv"`,
        },
      });
    }
    return json({ entries: results });
  } catch (err) {
    return errorResponse(c, err);
  }
});
