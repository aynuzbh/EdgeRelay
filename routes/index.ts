/**
 * GET / — 根路径：从静态资产取 SPA index.html，注入站点 SEO 元数据（站点名/描述/Logo/主页）
 * 站点信息来自 settings，可随时在控制台修改，无需重新部署。
 */
import { defineHandler } from "void";
import type { Env } from "../src/types";
import { getSettings } from "../src/settings";
import { errorResponse } from "../src/errors";

export const GET = defineHandler(async (c) => {
  try {
    const env = c.env as unknown as Env;
    const s = await getSettings(env.DB);
    const siteName = s.siteName ?? "EdgeRelay";
    const desc = s.siteDescription ?? "";
    const logo = s.siteLogoUrl ?? "/logo.png";

    const assetReq = new Request(c.req.url);
    const resp = env.ASSETS
      ? await env.ASSETS.fetch(assetReq)
      : await fetch(assetReq);
    let html = await resp.text();

    // title
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(siteName)} — AI API 网关控制台</title>`);
    // meta description / og / favicon：删除已有后统一注入
    html = html.replace(/<meta\s+name="description"[^>]*>/gi, "");
    html = html.replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, "");
    html = html.replace(/<\/head>/i, [
      `<meta name="description" content="${esc(desc)}">`,
      `<meta property="og:title" content="${esc(siteName)}">`,
      `<meta property="og:description" content="${esc(desc)}">`,
      `<meta property="og:image" content="${esc(logo)}">`,
      `<meta property="og:type" content="website">`,
      `<link rel="icon" href="${esc(logo)}">`,
      `<link rel="apple-touch-icon" href="${esc(logo)}">`,
    ].join("\n") + "\n</head>");

    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(c, err);
  }
});

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
