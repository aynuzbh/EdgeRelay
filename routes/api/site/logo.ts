/** GET /api/site/logo — 站点 Logo（R2 存储，控制台可替换） */
import { defineHandler } from "void";
import type { Env } from "../../../src/types";
import { getSettings } from "../../../src/settings";

export const GET = defineHandler(async (c) => {
  const env = c.env as unknown as Env;
  if (env.STORAGE) {
    const obj = await env.STORAGE.get("site/logo.png");
    if (obj) return new Response(obj.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } });
  }
  // 回退：构建期内置 logo
  return env.ASSETS
    ? env.ASSETS.fetch(new Request(new URL("/logo.png", c.req.url).toString()))
    : new Response("Not found", { status: 404 });
});
