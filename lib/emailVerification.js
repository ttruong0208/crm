const { pool, findUserByEmail, getAppState, saveAppState } = require("./db");
const { hashToken, generateVerificationCode, sendVerificationEmail } = require("./email");
const { normalizeCrmState } = require("./crmExtensions");
const { startFreeTrial } = require("./plans");

const CODE_TTL_MS = Number(process.env.EMAIL_CODE_TTL_MINUTES || 15) * 60 * 1000;

async function deleteVerificationTokensForUser(userId) {
  await pool.query(`DELETE FROM email_verification_tokens WHERE user_id = $1`, [userId]);
}

async function createEmailVerificationCode(userId) {
  const rawCode = generateVerificationCode();
  const tokenHash = hashToken(rawCode);
  const id = `evt_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await deleteVerificationTokensForUser(userId);
  await pool.query(
    `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [id, userId, tokenHash, expiresAt.toISOString()],
  );

  return { rawCode, expiresAt };
}

async function sendUserVerificationEmail(user, { waitForDelivery = false } = {}) {
  const { rawCode } = await createEmailVerificationCode(user.id);
  const sendPromise = sendVerificationEmail({ to: user.email, code: rawCode });

  if (waitForDelivery) {
    const result = await sendPromise;
    return { code: rawCode, ...result };
  }

  sendPromise.catch((err) => {
    console.error("Verification email failed:", user.email, err.message);
  });
  return { code: rawCode, ok: true, queued: true };
}

async function finishEmailVerification(userId, username, email, alreadyVerified) {
  if (alreadyVerified) {
    await deleteVerificationTokensForUser(userId);
    return { ok: true, alreadyVerified: true, email, username };
  }

  await pool.query(
    `UPDATE users SET email_verified = true, email_verified_at = NOW() WHERE id = $1`,
    [userId],
  );
  await deleteVerificationTokensForUser(userId);

  const state = normalizeCrmState(await getAppState(username));
  if (state.crmSettings?.subscriptionPlan === "free" && !state.crmSettings?.trialEndsAt) {
    state.crmSettings = startFreeTrial(state.crmSettings);
    await saveAppState(username, state);
  }

  return { ok: true, email, username };
}

async function verifyEmailByCode(email, rawCode) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const code = String(rawCode || "").trim().replace(/\s/g, "");

  if (!normalizedEmail) {
    return { ok: false, error: "Nhập email đã đăng ký." };
  }
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Mã xác minh gồm 6 chữ số." };
  }

  const user = await findUserByEmail(normalizedEmail);
  if (!user) {
    return { ok: false, error: "Email không tồn tại hoặc mã không đúng." };
  }
  if (user.email_verified) {
    return finishEmailVerification(user.id, user.username, user.email, true);
  }

  const tokenHash = hashToken(code);
  const result = await pool.query(
    `
    SELECT t.id AS token_id, t.expires_at
    FROM email_verification_tokens t
    WHERE t.user_id = $1 AND t.token_hash = $2
    LIMIT 1
    `,
    [user.id, tokenHash],
  );
  const row = result.rows[0];
  if (!row) {
    return { ok: false, error: "Mã xác minh không đúng." };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await pool.query(`DELETE FROM email_verification_tokens WHERE id = $1`, [row.token_id]);
    return { ok: false, error: "Mã đã hết hạn. Bấm gửi lại mã." };
  }

  return finishEmailVerification(user.id, user.username, user.email, false);
}

async function markEmailVerifiedByAdmin(userId) {
  const { findUserById } = require("./db");
  const user = await findUserById(userId);
  if (!user) return { ok: false, error: "User không tồn tại." };
  if (!user.email) return { ok: false, error: "User không có email." };
  return finishEmailVerification(user.id, user.username, user.email, user.email_verified);
}

module.exports = {
  sendUserVerificationEmail,
  verifyEmailByCode,
  markEmailVerifiedByAdmin,
};
