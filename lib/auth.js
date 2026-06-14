const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { findUserById, getWorkspaceId, getWorkspaceState } = require("./db");
const { assertTrialActive } = require("./plans");

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
const BCRYPT_ROUNDS = 10;

function emailVerificationRequired() {
  return process.env.REQUIRE_EMAIL_VERIFICATION !== "false";
}

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      type: "access",
    },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRES_IN },
  );
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.type && payload.type !== "access") {
    throw new Error("Invalid token type");
  }
  return payload;
}

function getAccessTokenExpiresInSeconds() {
  const raw = JWT_ACCESS_EXPIRES_IN;
  const match = /^(\d+)([smhd])$/.exec(raw);
  if (!match) return 15 * 60;
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * (multipliers[unit] || 60);
}

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

async function comparePassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

async function assertUserAccessAllowed(dbUser) {
  if (emailVerificationRequired() && dbUser.email && !dbUser.email_verified) {
    return {
      status: 403,
      body: {
        error: "Vui lòng xác minh email trước khi dùng CRM.",
        code: "EMAIL_NOT_VERIFIED",
      },
    };
  }

  const appState = await getWorkspaceState(dbUser);
  const trialBlock = assertTrialActive(appState.crmSettings);
  if (trialBlock) {
    return { status: 403, body: trialBlock };
  }

  return null;
}

async function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = verifyAccessToken(token);
    const dbUser = await findUserById(payload.sub);
    if (!dbUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const accessBlock = await assertUserAccessAllowed(dbUser);
    if (accessBlock) {
      return res.status(accessBlock.status).json(accessBlock.body);
    }

    req.user = {
      id: dbUser.id,
      username: dbUser.username,
      role: dbUser.role,
      email: dbUser.email,
      emailVerified: dbUser.email_verified,
      workspaceId: getWorkspaceId(dbUser),
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  getAccessTokenExpiresInSeconds,
  hashPassword,
  comparePassword,
  authRequired,
  assertUserAccessAllowed,
  emailVerificationRequired,
};
