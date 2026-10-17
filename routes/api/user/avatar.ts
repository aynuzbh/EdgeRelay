/** GET /api/user/avatar — 当前登录用户头像（R2） */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { requireUser } from "../../../src/auth";

export const GET = defineHandler(async (c) => {
  try {
  const env = c.env as unknown as Env;
  const u = await requireUser(c);
  for (const ext of ["png", "jpg", "webp", "svg"]) {
    const obj = await env.STORAGE?.get(`avatars/${u.id}.${ext}`);
    if (obj) {
      const types: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };
      return new Response(obj.body, { headers: { "content-type": types[ext]!, "cache-control": "no-store" } });
    }
  }
  return new Response("Not found", { status: 404 });
  } catch (err) {
    return new Response(JSON.stringify({ error: { message: err instanceof Error ? err.message : "error", code: "auth_required" } }), { status: 401, headers: { "content-type": "application/json" } });
  }
});
