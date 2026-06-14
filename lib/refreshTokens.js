const crypto = require("crypto");
const { pool } = require("./db");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateRefreshToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function createRefreshToken(userId, expiresAt) {
  const id = `rt_${crypto.randomBytes(8).toString("hex")}`;
  const plainToken = generateRefreshToken();
  const tokenHash = hashToken(plainToken);

  await pool.query(
    `
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
    VALUES ($1, $2, $3, $4)
    `,
    [id, userId, tokenHash, expiresAt],
  );

  return { id, plainToken, expiresAt };
}

async function findValidRefreshToken(plainToken) {
  const tokenHash = hashToken(plainToken);
  const result = await pool.query(
    `
    SELECT rt.id, rt.user_id, rt.expires_at, u.username, u.role
    FROM refresh_tokens rt
    JOIN users u ON u.id = rt.user_id
    WHERE rt.token_hash = $1
      AND rt.revoked_at IS NULL
      AND rt.expires_at > NOW()
    LIMIT 1
    `,
    [tokenHash],
  );
  return result.rows[0] || null;
}

async function revokeRefreshToken(plainToken) {
  const tokenHash = hashToken(plainToken);
  await pool.query(
    `
    UPDATE refresh_tokens
    SET revoked_at = NOW()
    WHERE token_hash = $1 AND revoked_at IS NULL
    `,
    [tokenHash],
  );
}

async function revokeRefreshTokenById(id) {
  await pool.query(
    `
    UPDATE refresh_tokens
    SET revoked_at = NOW()
    WHERE id = $1 AND revoked_at IS NULL
    `,
    [id],
  );
}

module.exports = {
  createRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
  revokeRefreshTokenById,
};
