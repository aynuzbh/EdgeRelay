/** GET /api/billing/balance — 查询余额 */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { requireUser, billingScope } from "../../../src/auth";
import { errorResponse } from "../../../src/errors";
import { getBalance } from "../../../src/billing";
import { json } from "../../../src/settings";

export const GET = defineHandler(async (c) => {
  try {
    const user = await requireUser(c);
    const scope = billingScope(user.id, null);
    const balance = await getBalance((c.env as unknown as Env).DB, scope);
    return json({ scope, ...balance });
  } catch (err) {
    return errorResponse(c, err);
  }
});
