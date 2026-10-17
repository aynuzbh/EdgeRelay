/** 验证码邮件 HTML 模板（EdgeRelay 品牌） */
export function verifyCodeEmailHtml(siteName: string, code: string, minutes = 10): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,'PingFang SC','Microsoft YaHei',Segoe UI,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.08);">
  <tr><td style="background:#F38020;padding:20px 32px;">
    <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.5px;">${siteName}</span>
    <span style="color:rgba(255,255,255,.85);font-size:12px;padding-left:10px;">AI API Gateway</span>
  </td></tr>
  <tr><td style="padding:36px 32px 8px;">
    <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1f2430;">你的验证码</p>
    <p style="margin:0;font-size:13px;color:#6b7280;">请在 ${minutes} 分钟内输入以下验证码完成操作。若非本人操作，请忽略本邮件。</p>
  </td></tr>
  <tr><td align="center" style="padding:24px 32px;">
    <div style="display:inline-block;background:#fff7ed;border:1px dashed #F38020;border-radius:12px;padding:16px 40px;">
      <span style="font-size:34px;font-weight:700;letter-spacing:10px;color:#1f2430;font-family:Consolas,Menlo,monospace;">${code}</span>
    </div>
  </td></tr>
  <tr><td style="padding:0 32px 12px;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">验证码 10 分钟内有效，请勿泄露给他人。</p>
  </td></tr>
  <tr><td style="padding:20px 32px 32px;border-top:1px solid #f0f1f3;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">本邮件由 ${siteName} 系统自动发送，请勿直接回复。</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
