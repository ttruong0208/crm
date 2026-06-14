function parseGroupLines(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const groups = [];
  for (const line of lines) {
    if (/^ten nhom|^name|^group/i.test(line) && groups.length === 0) {
      continue;
    }
    const parts = line.includes("\t")
      ? line.split("\t").map((p) => p.trim())
      : line.split(/[,;]/).map((p) => p.trim());
    const name = parts[0];
    if (!name) continue;
    groups.push({
      name,
      owner: parts[1] || "",
      zaloGroupId: parts[2] || "",
    });
  }
  return groups;
}

function parseGroupCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());
  const hasHeader = header.some((h) => /name|ten|nhom|group/.test(h));

  const startIndex = hasHeader ? 1 : 0;
  const nameIdx = header.findIndex((h) => /^(ten nhom|ten|name|group)$/.test(h));
  const ownerIdx = header.findIndex((h) => /^(owner|phu trach|nguoi)/.test(h));
  const idIdx = header.findIndex((h) => /^(id|zalo|groupid|ma)/.test(h));

  const groups = [];
  for (let i = startIndex; i < lines.length; i += 1) {
    const cols = lines[i].split(delimiter).map((c) => c.replace(/^"|"$/g, "").trim());
    const name = nameIdx >= 0 ? cols[nameIdx] : cols[0];
    if (!name) continue;
    groups.push({
      name,
      owner: ownerIdx >= 0 ? cols[ownerIdx] || "" : cols[1] || "",
      zaloGroupId: idIdx >= 0 ? cols[idIdx] || "" : cols[2] || "",
    });
  }
  return groups;
}

function mergeGroups(existingGroups, incomingGroups, { skipDuplicates = true, updateExisting = false } = {}) {
  const result = [...existingGroups];
  let imported = 0;
  let skipped = 0;

  const indexByName = new Map(
    result.map((g) => [g.name.trim().toLowerCase(), g]),
  );
  const indexByZaloId = new Map(
    result.filter((g) => g.zaloGroupId).map((g) => [g.zaloGroupId, g]),
  );

  for (const row of incomingGroups) {
    const name = row.name?.trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    const zaloGroupId = row.zaloGroupId?.trim() || "";
    const owner = row.owner?.trim() || "";
    const key = name.toLowerCase();

    const existingByName = indexByName.get(key);
    const existingById = zaloGroupId ? indexByZaloId.get(zaloGroupId) : null;
    const existing = existingById || existingByName;

    if (existing && (skipDuplicates || updateExisting)) {
      if (updateExisting) {
        if (zaloGroupId) existing.zaloGroupId = zaloGroupId;
        if (owner) existing.owner = owner;
        if (row.chatType && row.chatType !== "unknown") existing.chatType = row.chatType;
        if (row.phone) existing.phone = row.phone;
        if (row.segment) existing.segment = row.segment;
        if (row.zaloAccountId) existing.zaloAccountId = row.zaloAccountId;
        if (Array.isArray(row.tags) && row.tags.length) {
          existing.tags = [...new Set([...(existing.tags || []), ...row.tags])];
        }
      }
      skipped += 1;
      continue;
    }

    const chatType = row.chatType === "user" ? "user" : row.chatType === "unknown" ? "unknown" : "group";
    const group = {
      id: `g_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name,
      owner,
      zaloGroupId,
      chatType,
      phone: row.phone?.trim() || "",
      segment: row.segment || "lead",
      tags: Array.isArray(row.tags) ? row.tags : [],
      customerNote: "",
      zaloAccountId: row.zaloAccountId || null,
      lastInteractionAt: null,
      interactions: [],
      createdAt: Date.now(),
    };
    result.push(group);
    indexByName.set(key, group);
    if (zaloGroupId) indexByZaloId.set(zaloGroupId, group);
    imported += 1;
  }

  return { groups: result, imported, skipped };
}

function groupsToCsv(groups) {
  const header = ["ten_nhom", "nguoi_phu_trach", "zalo_group_id"];
  const rows = groups.map((g) => [
    g.name || "",
    g.owner || "",
    g.zaloGroupId || "",
  ]);
  return [header, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

module.exports = {
  parseGroupLines,
  parseGroupCsv,
  mergeGroups,
  groupsToCsv,
};
