import { defineConfig } from "void/config";

// Void 会根据代码中的 c.env.DB / KV / STORAGE 推断并自动开通 D1 / KV / R2 绑定。
// 此处仅声明 Worker 运行时配置。
export default defineConfig({
  worker: {
    compatibility_date: "2026-02-24",
    compatibility_flags: ["nodejs_compat"],
  },
  cloudflare: {
    name: "ai-gateway-mvp",
    // 与当前 Worker 可见性保持一致（workers.dev 公网访问开启，preview 关闭）
    workers_dev: true,
    preview_urls: false,
    routes: [{ pattern: "api.obitw.cn", custom_domain: true }], // 自定义域名（控制台 + API 同域入口）
  },
});
