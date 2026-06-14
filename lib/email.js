const crypto = require("crypto");

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch {
  nodemailer = null;
}

function getAppBaseUrl() {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM && process.env.SMTP_PASS);
}

function createTransport() {
  if (!nodemailer) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendVerificationEmail({ to, code }) {
  const ttlMinutes = Number(process.env.EMAIL_CODE_TTL_MINUTES || 15);
  const subject = "Mã xác minh email · Zalo Campaign CRM";
  const text = [
    "Xin chào,",
    "",
    "Mã xác minh đăng ký Zalo Campaign CRM của bạn:",
    "",
    code,
    "",
    `Mã có hiệu lực ${ttlMinutes} phút. Không chia sẻ mã cho ai.`,
    "",
    "Nếu bạn không đăng ký, hãy bỏ qua email này.",
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:480px">
      <h2 style="color:#0068ff;margin:0 0 12px">Xác minh email</h2>
      <p>Cảm ơn bạn đã đăng ký <strong>Zalo Campaign CRM</strong>.</p>
      <p>Nhập mã sau trên trang xác minh:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:20px 0;padding:16px;background:#f1f5f9;border-radius:12px;text-align:center">${code}</p>
      <p style="color:#64748b;font-size:14px">Mã hết hạn sau <strong>${ttlMinutes} phút</strong>.</p>
    </div>
  `;

  if (!isSmtpConfigured() || !nodemailer) {
    console.log("[email-dev] Verification code for", to, "→", code);
    return { ok: true, dev: true };
  }

  const transport = createTransport();
  if (!transport) {
    console.log("[email-dev] Verification code for", to, "→", code);
    return { ok: true, dev: true };
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
  return { ok: true, dev: false };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

module.exports = {
  getAppBaseUrl,
  isSmtpConfigured,
  sendVerificationEmail,
  generateVerificationCode,
  hashToken,
  generateToken,
};
