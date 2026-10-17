/**
 * 极简 SMTP 客户端（基于 cloudflare:sockets）
 *  - 支持 465 隐式 TLS 与 587 STARTTLS（startTls() 返回新 socket，正确切换流）
 *  - AUTH LOGIN；用户名不含 @ 时自动回退为发件人地址（企业邮/个人邮通用）
 *  - 阶段化错误信息，便于排查配置
 */
export type SmtpConfig = { host: string; port: number; username: string; password: string; from: string };

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

export async function sendMail(cfg: SmtpConfig, mail: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const { connect } = await import("cloudflare:sockets");
  const secure = cfg.port === 465;
  let socket = connect({ hostname: cfg.host, port: cfg.port }, {
    secureTransport: secure ? "on" : "starttls",
    allowHalfOpen: false,
  });
  let writer = socket.writable.getWriter();
  let reader = socket.readable.getReader();
  let buffer = "";
  let stage = `建立连接（${cfg.host}:${cfg.port}${secure ? " TLS" : " STARTTLS"}）`;

  const readUntil = async (expect: (code: number, text: string) => boolean): Promise<string> => {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const idx = buffer.lastIndexOf("\r\n");
      if (idx >= 0) {
        const lines = buffer.slice(0, idx + 2).split("\r\n").filter(Boolean);
        const last = lines[lines.length - 1] ?? "";
        const code = parseInt(last.slice(0, 3), 10);
        if (!isNaN(code) && expect(code, last)) {
          buffer = buffer.slice(idx + 2);
          return lines.join("\n");
        }
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
    }
    throw new Error(`SMTP 响应超时（阶段：${stage}）。请检查：主机/端口是否正确、服务器是否限制海外数据中心 IP`);
  };

  const cmd = async (line: string, ok: (code: number) => boolean, label?: string): Promise<string> => {
    if (label) stage = label;
    await writer.write(enc.encode(line + "\r\n"));
    return readUntil((c) => ok(c));
  };

  try {
    await readUntil((c) => c === 220); // greeting
    await cmd(`EHLO edgerelay`, (c) => c === 250, "EHLO 握手");

    if (!secure) {
      await cmd("STARTTLS", (c) => c === 220, "STARTTLS 升级");
      // 释放旧流后 startTls() 返回新的 TLS socket
      await writer.releaseLock();
      await reader.releaseLock();
      socket = socket.startTls();
      writer = socket.writable.getWriter();
      reader = socket.readable.getReader();
      buffer = "";
      stage = "TLS 后 EHLO 握手";
      await cmd(`EHLO edgerelay`, (c) => c === 250);
    }

    // AUTH 用户名：企业邮/个人邮必须用完整邮箱；仅当未含 @ 时回退到发件人地址
    const authUser = cfg.username.includes("@") ? cfg.username : (cfg.from || cfg.username);
    stage = "SMTP 认证";
    await cmd(`AUTH LOGIN`, (c) => c === 334);
    await cmd(b64(authUser), (c) => c === 334, "SMTP 认证（用户名）");
    await cmd(b64(cfg.password), (c) => c === 235, "SMTP 认证（密码，请确认是授权码）");

    await cmd(`MAIL FROM:<${cfg.from}>`, (c) => c === 250, "MAIL FROM");
    await cmd(`RCPT TO:<${mail.to}>`, (c) => c === 250 || c === 251, `RCPT TO（收件人 ${mail.to}）`);
    await cmd(`DATA`, (c) => c === 354, "DATA");

    const subject = `=?UTF-8?B?${b64(mail.subject)}?=`;
    const escapeDot = (t: string) => t.replace(/\r?\n/g, "\r\n").replace(/\r\n\./g, "\r\n..");
    const boundary = `----=_EdgeRelay_${Date.now().toString(36)}`;
    let bodySection: string;
    if (mail.html) {
      bodySection = [
        `--${boundary}`,
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: 8bit`,
        ``,
        escapeDot(mail.text),
        `--${boundary}`,
        `Content-Type: text/html; charset=UTF-8`,
        `Content-Transfer-Encoding: 8bit`,
        ``,
        escapeDot(mail.html),
        `--${boundary}--`,
      ].join("\r\n");
    } else {
      bodySection = [
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: 8bit`,
        ``,
        escapeDot(mail.text),
      ].join("\r\n");
    }
    const msg = [
      `From: ${cfg.username && cfg.username.includes("@") ? cfg.username : "EdgeRelay"} <${cfg.from}>`,
      `To: <${mail.to}>`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      mail.html
        ? `Content-Type: multipart/alternative; boundary="${boundary}"`
        : `Content-Type: text/plain; charset=UTF-8`,
      ``,
      bodySection,
      `.`,
    ].join("\r\n");
    stage = "发送正文";
    await writer.write(enc.encode(msg + "\r\n"));
    await readUntil((c) => c === 250);
    await cmd(`QUIT`, () => true, "QUIT").catch(() => {});
  } finally {
    try { await writer.releaseLock(); } catch { /* ignore */ }
    try { await reader.releaseLock(); } catch { /* ignore */ }
    try { socket.close(); } catch { /* ignore */ }
  }
}
