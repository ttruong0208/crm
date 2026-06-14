function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  return digits;
}

function phoneIndex(groups) {
  const map = new Map();
  for (const g of groups || []) {
    const p = normalizePhone(g.phone);
    if (p.length < 9) continue;
    if (!map.has(p)) map.set(p, []);
    map.get(p).push(g);
  }
  return map;
}

function findPhoneDuplicates(existingGroups, incomingGroups) {
  const index = phoneIndex(existingGroups);
  const seen = new Set();
  const duplicates = [];

  for (const incoming of incomingGroups || []) {
    const p = normalizePhone(incoming.phone);
    if (p.length < 9) continue;
    const matches = index.get(p) || [];
    for (const existing of matches) {
      if (existing.id === incoming.id) continue;
      const key = `${existing.id}:${p}:${incoming.name || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      duplicates.push({
        phone: p,
        existing: {
          id: existing.id,
          name: existing.name,
          zaloAccountId: existing.zaloAccountId,
          zaloGroupId: existing.zaloGroupId,
          chatType: existing.chatType,
        },
        incoming: {
          name: incoming.name,
          zaloAccountId: incoming.zaloAccountId,
          zaloGroupId: incoming.zaloGroupId,
          chatType: incoming.chatType,
          phone: incoming.phone,
        },
      });
    }
  }
  return duplicates;
}

function mergeLinkedChats(group, other) {
  const linked = [...(group.linkedZaloChats || [])];
  const push = (g) => {
    if (!g?.zaloGroupId && !g?.name) return;
    const exists = linked.some(
      (x) => x.zaloGroupId === g.zaloGroupId && x.zaloAccountId === g.zaloAccountId,
    );
    if (!exists) {
      linked.push({
        zaloAccountId: g.zaloAccountId || null,
        zaloGroupId: g.zaloGroupId || "",
        name: g.name || "",
        chatType: g.chatType || "unknown",
      });
    }
  };
  push(group);
  push(other);
  return linked;
}

function mergeGroupProfiles(keep, merge) {
  const primary = { ...keep };
  const secondary = { ...merge };

  primary.phone = primary.phone || secondary.phone || "";
  primary.owner = primary.owner || secondary.owner || "";
  primary.zaloGroupId = primary.zaloGroupId || secondary.zaloGroupId || "";
  primary.customerNote = [primary.customerNote, secondary.customerNote].filter(Boolean).join("\n---\n");
  primary.tags = [...new Set([...(primary.tags || []), ...(secondary.tags || [])])];
  primary.segment = primary.segment || secondary.segment || "lead";

  const interactions = [...(primary.interactions || []), ...(secondary.interactions || [])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
  primary.interactions = interactions.slice(0, 50);
  primary.lastInteractionAt =
    primary.lastInteractionAt || secondary.lastInteractionAt || primary.interactions[0]?.at || null;

  primary.linkedZaloChats = mergeLinkedChats(primary, secondary);

  return primary;
}

function applyGroupMerge(state, keepId, mergeId) {
  const groups = [...(state.groups || [])];
  const keepIdx = groups.findIndex((g) => g.id === keepId);
  const mergeIdx = groups.findIndex((g) => g.id === mergeId);
  if (keepIdx < 0 || mergeIdx < 0) {
    return { ok: false, error: "Group not found", code: "NOT_FOUND" };
  }

  const merged = mergeGroupProfiles(groups[keepIdx], groups[mergeIdx]);
  groups[keepIdx] = merged;
  groups.splice(mergeIdx, 1);

  const tasksByCampaign = { ...(state.tasksByCampaign || {}) };
  for (const campaignId of Object.keys(tasksByCampaign)) {
    tasksByCampaign[campaignId] = (tasksByCampaign[campaignId] || []).map((task) =>
      task.groupId === mergeId ? { ...task, groupId: keepId, updatedAt: Date.now() } : task,
    );
  }

  const broadcasts = (state.broadcasts || []).map((b) => {
    if (!b.recipients?.[mergeId]) return b;
    const recipients = { ...b.recipients };
    const rec = recipients[mergeId];
    delete recipients[mergeId];
    if (!recipients[keepId]) recipients[keepId] = rec;
    return { ...b, recipients };
  });

  return {
    ok: true,
    keepId,
    mergeId,
    state: {
      ...state,
      groups,
      tasksByCampaign,
      broadcasts,
    },
  };
}

module.exports = {
  normalizePhone,
  findPhoneDuplicates,
  mergeGroupProfiles,
  applyGroupMerge,
};
