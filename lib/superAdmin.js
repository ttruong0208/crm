const { normalizeEmail } = require("./userAdmin");

function getPlatformAdminEmails() {
  const raw = process.env.SUPER_ADMIN_EMAILS || "truongthanhsbay@gmail.com";
  return raw
    .split(",")
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
}

function getPlatformAdminUsernames() {
  const raw = process.env.PLATFORM_ADMIN_USERNAMES || "admin";
  return raw
    .split(",")
    .map((u) => String(u || "").trim().toLowerCase())
    .filter(Boolean);
}

/** Quản trị hệ thống — xem/sửa mọi khách đăng ký */
function isPlatformAdmin(user) {
  if (!user) return false;
  if (getPlatformAdminUsernames().includes(String(user.username || "").toLowerCase())) {
    return true;
  }
  if (!user.email) return false;
  return getPlatformAdminEmails().includes(normalizeEmail(user.email));
}

function canManageAllUsers(user) {
  return isPlatformAdmin(user);
}

function isSuperAdmin(user) {
  return isPlatformAdmin(user);
}

function selfPlanChangeAllowed(user) {
  if (isPlatformAdmin(user)) return true;
  return process.env.ALLOW_SELF_PLAN_CHANGE === "true";
}

module.exports = {
  getPlatformAdminEmails,
  getPlatformAdminUsernames,
  isPlatformAdmin,
  canManageAllUsers,
  isSuperAdmin,
  selfPlanChangeAllowed,
};
