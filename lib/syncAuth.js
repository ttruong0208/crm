const { getAppState } = require("./db");

/** Extension token chỉ được POST vào các endpoint này — không GET/DELETE toàn DB */
const SYNC_TOKEN_ALLOWLIST = new Set([
  "/api/sync/heartbeat",
  "/api/sync/scan-groups",
  "/api/sync/zalo-sent",
  "/api/sync/interaction",
]);

async function findSyncContextByToken(token) {
  if (!token) return null;
  const { pool } = require("./db");
  const result = await pool.query(
    `SELECT username, state
     FROM app_states
     WHERE state->'zaloSync'->>'token' = $1
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(state->'zaloAccounts', '[]'::jsonb)) elem
          WHERE elem->>'syncToken' = $1
        )
     LIMIT 1`,
    [token],
  );
  const row = result.rows[0];
  if (!row) return null;
  const state = row.state || {};
  let accountId = null;
  if (state.zaloSync?.token !== token) {
    accountId = (state.zaloAccounts || []).find((a) => a.syncToken === token)?.id || null;
  }
  return { username: row.username, accountId, isAccountToken: Boolean(accountId) };
}

async function syncTokenRequired(req, res, next) {
  try {
    if (req.method !== "POST") {
      return res.status(403).json({
        error: "Sync token chỉ được phép POST — không GET/PUT/DELETE",
        code: "SYNC_METHOD_DENIED",
      });
    }

    if (!SYNC_TOKEN_ALLOWLIST.has(req.path)) {
      return res.status(403).json({
        error: "Sync token không có quyền truy cập endpoint này",
        code: "SYNC_ENDPOINT_DENIED",
      });
    }

    const token =
      req.headers["x-zalo-sync-token"] ||
      req.body?.syncToken ||
      req.query?.syncToken;
    if (!token) {
      return res.status(401).json({ error: "Sync token required" });
    }

    const ctx = await findSyncContextByToken(token);
    if (!ctx?.username) {
      return res.status(401).json({ error: "Invalid sync token" });
    }

    const state = await getAppState(ctx.username);
    const globalOk = state?.zaloSync?.token === token;
    const accountOk = (state.zaloAccounts || []).some((a) => a.syncToken === token);
    if (!globalOk && !accountOk) {
      return res.status(401).json({ error: "Invalid sync token" });
    }
    if (state.zaloSync.enabled === false) {
      return res.status(403).json({ error: "Zalo sync is disabled" });
    }

    req.syncUser = { username: ctx.username };
    req.syncState = state;
    req.syncAccountId = ctx.accountId || state.crmSettings?.activeZaloAccountId || null;
    req.syncTokenScope = "write_only";
    return next();
  } catch (error) {
    console.error("Sync auth error:", error);
    return res.status(500).json({ error: "Sync auth failed" });
  }
}

module.exports = {
  findSyncContextByToken,
  syncTokenRequired,
  SYNC_TOKEN_ALLOWLIST,
};
