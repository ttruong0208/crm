const { signAccessToken, getAccessTokenExpiresInSeconds } = require("./auth");
const { createRefreshToken, revokeRefreshTokenById } = require("./refreshTokens");

const REFRESH_TOKEN_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 30);

function getRefreshExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);
  return expiresAt;
}

async function issueSession(user) {
  const accessToken = signAccessToken(user);
  const refresh = await createRefreshToken(user.id, getRefreshExpiresAt());

  return {
    accessToken,
    refreshToken: refresh.plainToken,
    expiresIn: getAccessTokenExpiresInSeconds(),
    tokenType: "Bearer",
  };
}

async function rotateSession(user, oldRefreshRecord) {
  await revokeRefreshTokenById(oldRefreshRecord.id);
  return issueSession(user);
}

module.exports = {
  issueSession,
  rotateSession,
};
