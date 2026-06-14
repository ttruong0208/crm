const VALID_ROLES = ["admin", "editor", "responder"];

const ROLE_LABELS = {
  admin: "Quản trị",
  editor: "Người soạn tin",
  responder: "Người trả lời",
};

function normalizeUsername(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function validateUsername(username) {
  if (!username || username.length < 3 || username.length > 32) {
    return "Username phải từ 3–32 ký tự.";
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    return "Username chỉ gồm chữ thường, số và dấu gạch dưới.";
  }
  return null;
}

function validatePassword(password) {
  if (!password || password.length < 6) {
    return "Mật khẩu tối thiểu 6 ký tự.";
  }
  if (password.length > 128) {
    return "Mật khẩu quá dài.";
  }
  return null;
}

function validatePasswordConfirm(password, passwordConfirm) {
  if (password !== passwordConfirm) {
    return "Mật khẩu nhập lại không khớp.";
  }
  return null;
}

function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

function validateEmail(email) {
  if (!email) return "Email không được để trống.";
  if (email.length > 254) return "Email quá dài.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Email không hợp lệ.";
  }
  return null;
}

function usernameFromEmail(email) {
  const local = email.split("@")[0] || "user";
  let base = normalizeUsername(local.replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_"));
  if (base.length < 3) base = `user_${base}`;
  return base.slice(0, 28);
}

async function uniqueUsername(base, findUserByUsername) {
  let candidate = base;
  let n = 0;
  while (await findUserByUsername(candidate)) {
    n += 1;
    candidate = `${base.slice(0, 24)}_${n}`;
  }
  return candidate;
}

function buildNewWorkspaceState(role, planId) {
  const { resolveDefaultPlanId } = require("./plans");
  const plan = planId === "free" ? "free" : resolveDefaultPlanId();
  return {
    groups: [],
    campaigns: [],
    tasksByCampaign: {},
    activeCampaignId: null,
    broadcasts: [],
    activeBroadcastId: null,
    zaloAccounts: [],
    tagCatalog: [],
    segments: [],
    messageTemplates: [],
    quickReplies: [],
    crmSettings: {
      subscriptionPlan: plan,
    },
    role,
  };
}

function validateRole(role) {
  if (!VALID_ROLES.includes(role)) {
    return "Vai trò phải là admin, editor hoặc responder.";
  }
  return null;
}

function buildUserStateFromAdmin(adminState, role) {
  const clone = (value) => JSON.parse(JSON.stringify(value ?? null));
  return {
    groups: clone(adminState.groups) || [],
    campaigns: clone(adminState.campaigns) || [],
    tasksByCampaign: clone(adminState.tasksByCampaign) || {},
    activeCampaignId: adminState.activeCampaignId || null,
    broadcasts: clone(adminState.broadcasts) || [],
    activeBroadcastId: adminState.activeBroadcastId || null,
    zaloAccounts: clone(adminState.zaloAccounts) || [],
    tagCatalog: clone(adminState.tagCatalog) || [],
    segments: clone(adminState.segments) || [],
    messageTemplates: clone(adminState.messageTemplates) || [],
    quickReplies: clone(adminState.quickReplies) || [],
    crmSettings: clone(adminState.crmSettings) || {},
    role,
  };
}

module.exports = {
  VALID_ROLES,
  ROLE_LABELS,
  normalizeUsername,
  validateUsername,
  validatePassword,
  validatePasswordConfirm,
  normalizeEmail,
  validateEmail,
  usernameFromEmail,
  uniqueUsername,
  validateRole,
  buildUserStateFromAdmin,
  buildNewWorkspaceState,
};
