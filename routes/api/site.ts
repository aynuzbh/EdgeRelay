/** GET /api/site — 公开的站点信息（SEO 与登录页品牌、OAuth 可用性） */
import { defineHandler } from "void";
import type { Env } from "../../src/types";
import { getSettings } from "../../src/settings";
import { json } from "../../src/settings";

export const GET = defineHandler(async (c) => {
  const env = c.env as unknown as Env;
  const s = await getSettings(env.DB);
  return json({
    siteName: s.siteName ?? "EdgeRelay",
    siteDescription: s.siteDescription ?? "",
    siteLogoUrl: s.siteLogoUrl ?? "/logo.png",
    siteHomepage: s.siteHomepage ?? "",
    oauth: { github: !!s.oauthGithubEnabled, google: !!s.oauthGoogleEnabled },
    smtpEnabled: !!s.smtpEnabled,
  });
});
