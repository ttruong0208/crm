function inferChatTypeFromId(zaloGroupId) {
  const raw = String(zaloGroupId || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (/^g\d/.test(lower) || /^sg\d/.test(lower) || lower.startsWith("group")) return "group";
  if (/^u\d/.test(lower) || /^user/.test(lower)) return "user";
  if (/^\d{5,}$/.test(raw)) return "user";
  return null;
}

function normalizeChatType(value, zaloGroupId) {
  const t = String(value || "").toLowerCase();
  if (t === "group" || t === "nhom" || t === "room") return "group";
  if (t === "user" || t === "personal" || t === "friend" || t === "ca_nhan") return "user";
  const inferred = inferChatTypeFromId(zaloGroupId);
  if (inferred) return inferred;
  return "unknown";
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function applyNameHints(rows) {
  const groupNames = new Set();
  const userNames = new Set();
  for (const row of rows || []) {
    const n = normalizeName(row?.name);
    if (!n) continue;
    const t = normalizeChatType(row?.chatType, row?.zaloGroupId);
    if (t === "group") groupNames.add(n);
    if (t === "user") userNames.add(n);
  }
  return (rows || []).map((row) => {
    const t = normalizeChatType(row?.chatType, row?.zaloGroupId);
    if (t !== "unknown") return { ...row, chatType: t };
    const n = normalizeName(row?.name);
    if (groupNames.has(n)) return { ...row, chatType: "group" };
    if (userNames.has(n)) return { ...row, chatType: "user" };
    return { ...row, chatType: "unknown" };
  });
}

function normalizeScannedGroups(rows) {
  if (!Array.isArray(rows)) return [];
  const map = new Map();
  for (const row of rows) {
    const name = String(row?.name || row?.groupName || "").trim();
    if (!name || name.length < 2 || name.length > 120) continue;
    if (/^\d+$/.test(name)) continue;
    const zaloGroupId = String(row?.zaloGroupId || row?.id || "").trim();
    const owner = String(row?.owner || "").trim();
    const chatType = normalizeChatType(row?.chatType || row?.type, zaloGroupId);
    const key = zaloGroupId || name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { name: name.slice(0, 120), owner, zaloGroupId, chatType });
    }
  }
  return applyNameHints([...map.values()]);
}

function countChatTypes(rows) {
  const counts = { group: 0, user: 0, unknown: 0, total: 0 };
  for (const row of rows || []) {
    const t = normalizeChatType(row?.chatType, row?.zaloGroupId);
    counts[t] = (counts[t] || 0) + 1;
    counts.total += 1;
  }
  return counts;
}

function filterByChatType(rows, mode) {
  if (mode === "all") return rows || [];
  return (rows || []).filter((row) => normalizeChatType(row?.chatType, row?.zaloGroupId) === mode);
}

module.exports = {
  inferChatTypeFromId,
  normalizeChatType,
  normalizeScannedGroups,
  countChatTypes,
  filterByChatType,
};
