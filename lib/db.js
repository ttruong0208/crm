const { Pool } = require("pg");
const { normalizeCrmState } = require("./crmExtensions");
const fs = require("fs/promises");
const path = require("path");

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/zalo_crm";

const pool = new Pool({
  connectionString: DATABASE_URL,
});

const initialState = {
  groups: [],
  campaigns: [],
  tasksByCampaign: {},
  activeCampaignId: null,
  role: "editor",
};

async function initDb() {
  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  const schemaSql = await fs.readFile(schemaPath, "utf8");
  // Chạy từng câu — tránh lỗi thứ tự migration trên DB đã tồn tại
  const statements = schemaSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));
  for (const statement of statements) {
    await pool.query(`${statement};`);
  }
}

async function findUserByUsername(username) {
  const result = await pool.query(
    `SELECT id, username, password_hash, role, email, email_verified, workspace_id, created_at
     FROM users WHERE username = $1 LIMIT 1`,
    [username],
  );
  return result.rows[0] || null;
}

async function findUserByEmail(email) {
  const result = await pool.query(
    `SELECT id, username, password_hash, role, email, email_verified, workspace_id, created_at
     FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  );
  return result.rows[0] || null;
}

async function findUserByLogin(identifier) {
  const value = String(identifier || "").trim();
  if (!value) return null;
  if (value.includes("@")) {
    return findUserByEmail(value);
  }
  return findUserByUsername(value.toLowerCase());
}

async function findUserById(id) {
  const result = await pool.query(
    `SELECT id, username, role, email, email_verified, workspace_id, created_at FROM users WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

function getWorkspaceId(user) {
  return user?.workspaceId || user?.workspace_id || user?.username;
}

async function getWorkspaceState(user) {
  const key = getWorkspaceId(user);
  const username = typeof user === "string" ? null : user?.username;
  let state = await getAppState(key);

  if (username && username !== key) {
    const legacy = await getAppState(username);
    const legacyHasData =
      (legacy.groups?.length || 0) > 0 ||
      (legacy.tasks?.length || 0) > 0 ||
      Boolean(legacy.zaloSync?.token) ||
      (legacy.zaloAccounts?.length || 0) > 0;
    const currentEmpty =
      (state.groups?.length || 0) === 0 &&
      (state.tasks?.length || 0) === 0 &&
      !state.zaloSync?.token &&
      (state.zaloAccounts?.length || 0) === 0;
    if (legacyHasData && currentEmpty) {
      await saveAppState(key, legacy);
      state = legacy;
    }
  }

  return state;
}

async function saveWorkspaceState(user, state) {
  return saveAppState(getWorkspaceId(user), state);
}

async function countUsers() {
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM users`);
  return result.rows[0].count;
}

async function countUsersInWorkspace(workspaceId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM users WHERE COALESCE(workspace_id, username) = $1`,
    [workspaceId],
  );
  return result.rows[0].count;
}

async function listUsersInWorkspace(workspaceId) {
  const result = await pool.query(
    `SELECT id, username, role, email, email_verified, created_at
     FROM users WHERE COALESCE(workspace_id, username) = $1
     ORDER BY created_at ASC`,
    [workspaceId],
  );
  return result.rows;
}

async function listRegisteredCustomers() {
  const result = await pool.query(
    `
    SELECT u.id, u.username, u.role, u.email, u.email_verified, u.email_verified_at,
           u.workspace_id, u.created_at, s.state AS app_state
    FROM users u
    LEFT JOIN app_states s ON s.username = COALESCE(u.workspace_id, u.username)
    WHERE u.email IS NOT NULL
    ORDER BY u.created_at DESC
    `,
  );
  return result.rows;
}

async function listAllUsersWithState() {
  const result = await pool.query(
    `
    SELECT u.id, u.username, u.role, u.email, u.email_verified, u.email_verified_at,
           u.workspace_id, u.created_at, s.state AS app_state
    FROM users u
    LEFT JOIN app_states s ON s.username = COALESCE(u.workspace_id, u.username)
    ORDER BY u.created_at DESC
    `,
  );
  return result.rows;
}

async function listUsers() {
  return listUsersInWorkspace(null);
}

async function deleteUserById(id) {
  const result = await pool.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [id]);
  return Boolean(result.rowCount);
}

async function updateUserRole(id, role) {
  const result = await pool.query(
    `UPDATE users SET role = $2 WHERE id = $1 RETURNING id, username, role, email, created_at`,
    [id, role],
  );
  return result.rows[0] || null;
}

async function updateUserPassword(id, passwordHash) {
  await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [id, passwordHash]);
}

async function upsertUser({ id, username, passwordHash, role, email, emailVerified, workspaceId }) {
  await pool.query(
    `
    INSERT INTO users (id, username, password_hash, role, email, email_verified, workspace_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (username) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        email = COALESCE(EXCLUDED.email, users.email),
        email_verified = EXCLUDED.email_verified,
        workspace_id = COALESCE(EXCLUDED.workspace_id, users.workspace_id)
    `,
    [
      id,
      username,
      passwordHash,
      role,
      email || null,
      emailVerified !== false,
      workspaceId || username,
    ],
  );
}

async function createUserRecord({
  id,
  username,
  passwordHash,
  role,
  email,
  emailVerified = false,
  workspaceId,
}) {
  await pool.query(
    `INSERT INTO users (id, username, password_hash, role, email, email_verified, workspace_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, username, passwordHash, role, email, emailVerified, workspaceId || username],
  );
}

async function getAppState(username) {
  const result = await pool.query(
    `SELECT state FROM app_states WHERE username = $1 LIMIT 1`,
    [username],
  );
  if (!result.rows[0]) {
    return getDefaultState();
  }
  return normalizeCrmState({
    ...getDefaultState(),
    ...result.rows[0].state,
  });
}

async function saveAppState(username, state) {
  await pool.query(
    `
    INSERT INTO app_states (username, state, updated_at)
    VALUES ($1, $2::jsonb, NOW())
    ON CONFLICT (username) DO UPDATE
    SET state = EXCLUDED.state,
        updated_at = NOW()
    `,
    [username, JSON.stringify(state)],
  );
}

function getDefaultState(role = "editor") {
  return {
    ...initialState,
    role,
  };
}

async function closeDb() {
  await pool.end();
}

module.exports = {
  pool,
  initDb,
  findUserByUsername,
  findUserByEmail,
  findUserByLogin,
  findUserById,
  getWorkspaceId,
  getWorkspaceState,
  saveWorkspaceState,
  countUsers,
  countUsersInWorkspace,
  listUsers,
  listUsersInWorkspace,
  listRegisteredCustomers,
  listAllUsersWithState,
  deleteUserById,
  updateUserRole,
  updateUserPassword,
  upsertUser,
  createUserRecord,
  getAppState,
  saveAppState,
  getDefaultState,
  closeDb,
};
