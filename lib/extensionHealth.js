const ONLINE_MS = 10 * 60 * 1000;

function isExtensionOnline(lastAt, thresholdMs = ONLINE_MS) {
  if (!lastAt) return false;
  const ts = new Date(lastAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < thresholdMs;
}

function recordHeartbeat(state, accountId, meta = {}) {
  const heartbeats = { ...(state.extensionHeartbeats || {}) };
  const key = accountId || "_global";
  const row = {
    at: new Date().toISOString(),
    extensionVersion: String(meta.extensionVersion || "").slice(0, 32),
    browser: String(meta.browser || "").slice(0, 120),
  };
  heartbeats[key] = row;

  const accounts = [...(state.zaloAccounts || [])];
  if (accountId) {
    const idx = accounts.findIndex((a) => a.id === accountId);
    if (idx >= 0) {
      accounts[idx] = { ...accounts[idx], lastHeartbeatAt: row.at };
    }
  }

  const zaloSync = {
    ...(state.zaloSync || {}),
    lastHeartbeatAt: row.at,
  };

  return {
    ...state,
    extensionHeartbeats: heartbeats,
    zaloAccounts: accounts,
    zaloSync,
  };
}

function buildExtensionHealthReport(state) {
  const heartbeats = state.extensionHeartbeats || {};
  const accounts = state.zaloAccounts || [];

  const rows = accounts.map((account) => {
    const hb = heartbeats[account.id];
    const lastAt = hb?.at || account.lastHeartbeatAt || null;
    const online = isExtensionOnline(lastAt);
    return {
      accountId: account.id,
      name: account.name,
      phone: account.phone || "",
      lastHeartbeatAt: lastAt,
      extensionVersion: hb?.extensionVersion || "",
      online,
      status: online ? "online" : "offline",
    };
  });

  const globalAt = heartbeats._global?.at || state.zaloSync?.lastHeartbeatAt || null;
  return {
    onlineThresholdMinutes: ONLINE_MS / 60000,
    global: {
      lastHeartbeatAt: globalAt,
      online: isExtensionOnline(globalAt),
      extensionVersion: heartbeats._global?.extensionVersion || "",
    },
    accounts: rows,
    offlineCount: rows.filter((r) => !r.online).length,
  };
}

module.exports = {
  ONLINE_MS,
  isExtensionOnline,
  recordHeartbeat,
  buildExtensionHealthReport,
};
