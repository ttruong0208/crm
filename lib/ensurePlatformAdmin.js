const { pool, findUserByEmail, findUserByUsername, createUserRecord, saveAppState } = require("./db");
const { hashPassword } = require("./auth");
const {
  normalizeEmail,
  usernameFromEmail,
  uniqueUsername,
  buildNewWorkspaceState,
} = require("./userAdmin");
const { normalizeCrmState } = require("./crmExtensions");
const { startFreeTrial } = require("./plans");
const { getPlatformAdminEmails } = require("./superAdmin");

/**
 * Tạo / đồng bộ tài khoản quản trị hệ thống từ env (SUPER_ADMIN_EMAILS).
 * - Chưa có user → tạo mới (cần PLATFORM_ADMIN_BOOTSTRAP_PASSWORD)
 * - Đã có user → đảm bảo role admin + email_verified
 * - PLATFORM_ADMIN_SYNC_PASSWORD=true → đặt lại mật khẩu theo env (một lần rồi tắt)
 */
async function ensurePlatformAdminUsers() {
  const emails = getPlatformAdminEmails();
  const bootstrapPassword = String(process.env.PLATFORM_ADMIN_BOOTSTRAP_PASSWORD || "").trim();
  const syncPassword = process.env.PLATFORM_ADMIN_SYNC_PASSWORD === "true";

  if (!emails.length) return { created: 0, updated: 0 };

  let created = 0;
  let updated = 0;

  for (const rawEmail of emails) {
    const email = normalizeEmail(rawEmail);
    if (!email) continue;

    let user = await findUserByEmail(email);
    const passwordHash =
      bootstrapPassword && (syncPassword || !user)
        ? await hashPassword(bootstrapPassword)
        : null;

    if (!user) {
      if (!bootstrapPassword) {
        console.warn(
          `Platform admin ${email} chưa tồn tại — đặt PLATFORM_ADMIN_BOOTSTRAP_PASSWORD trên Vercel rồi redeploy.`,
        );
        continue;
      }

      const username = await uniqueUsername(usernameFromEmail(email), findUserByUsername);
      const userId = `u_platform_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
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
      console.log(`Created platform admin: ${email} (${username})`);
      created += 1;
      continue;
    }

    const sets = [`role = 'admin'`, `email_verified = true`, `email_verified_at = COALESCE(email_verified_at, NOW())`];
    const params = [];
    if (passwordHash && syncPassword) {
      params.push(passwordHash);
      sets.push(`password_hash = $${params.length}`);
    }
    params.push(user.id);
    await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
    updated += 1;
    if (passwordHash && syncPassword) {
      console.log(`Synced platform admin password for ${email}`);
    }
  }

  return { created, updated };
}

module.exports = { ensurePlatformAdminUsers };
