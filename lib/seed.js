const { countUsers, upsertUser, saveAppState, getDefaultState } = require("./db");
const { hashPassword } = require("./auth");
const { resolveDefaultPlanId } = require("./plans");

const demoUsers = [
  { id: "u_admin", username: "admin", password: "admin123", role: "admin" },
  { id: "u_editor", username: "editor", password: "editor123", role: "editor" },
  { id: "u_responder", username: "responder", password: "responder123", role: "responder" },
];

const WORKSPACE_DEMO = "admin";

async function seedIfEmpty() {
  const userCount = await countUsers();
  if (userCount > 0) return false;

  const adminState = {
    ...getDefaultState("admin"),
    crmSettings: { subscriptionPlan: resolveDefaultPlanId() },
  };

  for (const user of demoUsers) {
    const passwordHash = await hashPassword(user.password);
    await upsertUser({
      id: user.id,
      username: user.username,
      passwordHash,
      role: user.role,
      email: null,
      emailVerified: true,
      workspaceId: WORKSPACE_DEMO,
    });
  }

  await saveAppState(WORKSPACE_DEMO, adminState);
  return true;
}

module.exports = { seedIfEmpty };
