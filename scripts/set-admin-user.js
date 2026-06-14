require("dotenv").config();
const { initDb, pool, findUserByEmail, findUserByUsername, createUserRecord } = require("../lib/db");
const { hashPassword } = require("../lib/auth");
const { normalizeEmail, usernameFromEmail, uniqueUsername, buildNewWorkspaceState } = require("../lib/userAdmin");
const { normalizeCrmState } = require("../lib/crmExtensions");
const { saveAppState } = require("../lib/db");
const { startFreeTrial } = require("../lib/plans");

const EMAIL = process.env.PLATFORM_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAILS?.split(",")[0] || "truongthanhsbay@gmail.com";
const PASSWORD = process.env.PLATFORM_ADMIN_BOOTSTRAP_PASSWORD || "111111";

async function main() {
  await initDb();
  const email = normalizeEmail(EMAIL);
  const passwordHash = await hashPassword(PASSWORD);
  let user = await findUserByEmail(email);

  if (user) {
    await pool.query(
      `UPDATE users
       SET role = 'admin',
           password_hash = $1,
           email_verified = true,
           email_verified_at = COALESCE(email_verified_at, NOW())
       WHERE id = $2`,
      [passwordHash, user.id],
    );
    console.log(`OK: ${email} (${user.username}) -> admin, mật khẩu đã đặt 111111`);
  } else {
    const username = await uniqueUsername(usernameFromEmail(email), findUserByUsername);
    const userId = `u_${Date.now()}`;
    await createUserRecord({
      id: userId,
      username,
      passwordHash,
      role: "admin",
      email,
      emailVerified: true,
      workspaceId: username,
    });
    let state = normalizeCrmState(buildNewWorkspaceState("admin", "free"));
    state.crmSettings = startFreeTrial(state.crmSettings);
    await saveAppState(username, state);
    console.log(`OK: tạo mới ${email} (${username}) admin, mật khẩu 111111`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
