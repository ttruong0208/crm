const DEFAULT_SEGMENTS = [
  { id: "lead", name: "Khách tiềm năng", color: "#3b82f6" },
  { id: "customer", name: "Đã mua", color: "#16a34a" },
  { id: "vip", name: "VIP", color: "#d97706" },
  { id: "inactive", name: "Lâu không tương tác", color: "#64748b" },
];

const DEFAULT_TAGS = [
  { id: "tag_hot", name: "Ưu tiên cao", color: "#dc2626" },
  { id: "tag_follow", name: "Cần follow-up", color: "#7c3aed" },
];

function emptyCrmSlice() {
  return {
    zaloAccounts: [],
    tagCatalog: [...DEFAULT_TAGS],
    segments: [...DEFAULT_SEGMENTS],
    messageTemplates: [],
    quickReplies: [],
    crmSettings: {
      webhookUrl: "",
      webhookSecret: "",
      inactiveDays: 14,
      activeZaloAccountId: null,
      subscriptionPlan: null,
    },
  };
}

function normalizeGroupProfile(group) {
  const g = { ...group };
  g.phone = String(g.phone || "").trim();
  g.customerNote = String(g.customerNote || "").trim();
  g.segment = g.segment || "lead";
  g.tags = Array.isArray(g.tags) ? g.tags.filter(Boolean) : [];
  g.zaloAccountId = g.zaloAccountId || null;
  g.lastInteractionAt = g.lastInteractionAt || null;
  g.interactions = Array.isArray(g.interactions) ? g.interactions.slice(0, 50) : [];
  g.linkedZaloChats = Array.isArray(g.linkedZaloChats) ? g.linkedZaloChats : [];
  return g;
}

function normalizeCrmState(state) {
  const base = emptyCrmSlice();
  const next = { ...state };
  next.zaloAccounts = Array.isArray(state.zaloAccounts) ? state.zaloAccounts : base.zaloAccounts;
  next.tagCatalog = Array.isArray(state.tagCatalog) && state.tagCatalog.length ? state.tagCatalog : base.tagCatalog;
  next.segments = Array.isArray(state.segments) && state.segments.length ? state.segments : base.segments;
  next.messageTemplates = Array.isArray(state.messageTemplates) ? state.messageTemplates : [];
  next.quickReplies = Array.isArray(state.quickReplies) ? state.quickReplies : [];
  next.crmSettings = { ...base.crmSettings, ...(state.crmSettings || {}) };
  if (!next.crmSettings.subscriptionPlan) {
    const { resolveDefaultPlanId } = require("./plans");
    next.crmSettings.subscriptionPlan = resolveDefaultPlanId();
  }
  next.groups = (state.groups || []).map(normalizeGroupProfile);
  return next;
}

function appendInteraction(group, entry) {
  const g = normalizeGroupProfile(group);
  const row = {
    id: `ix_${Date.now()}`,
    at: new Date().toISOString(),
    type: entry.type || "note",
    summary: String(entry.summary || "").slice(0, 500),
    by: entry.by || "",
  };
  g.interactions = [row, ...g.interactions].slice(0, 50);
  g.lastInteractionAt = row.at;
  return g;
}

function applyAutoRules(state) {
  const inactiveDays = Number(state.crmSettings?.inactiveDays || 14);
  const ms = inactiveDays * 86400000;
  const now = Date.now();
  const tagInactive = state.tagCatalog?.find((t) => /inactive|khong tuong tac/i.test(t.name));
  const tagFollow = state.tagCatalog?.find((t) => /follow/i.test(t.name));

  for (const group of state.groups || []) {
    const last = group.lastInteractionAt ? new Date(group.lastInteractionAt).getTime() : 0;
    if (!group.tags) group.tags = [];
    if (!last || now - last > ms) {
      if (tagInactive && !group.tags.includes(tagInactive.id)) group.tags.push(tagInactive.id);
      if (!group.segment || group.segment === "lead") group.segment = "inactive";
    }
    let dueFollow = false;
    for (const tasks of Object.values(state.tasksByCampaign || {})) {
      for (const t of tasks || []) {
        if (t.groupId !== group.id || !t.followUpAt || t.status === "done") continue;
        if (new Date(t.followUpAt).getTime() <= now) dueFollow = true;
      }
    }
    if (dueFollow && tagFollow && !group.tags.includes(tagFollow.id)) {
      group.tags.push(tagFollow.id);
    }
  }
  return state;
}

function assignZaloAccount(groups, accountId) {
  if (!accountId) return groups;
  return groups.map((g) => ({ ...g, zaloAccountId: g.zaloAccountId || accountId }));
}

function buildExportPayload(state) {
  return {
    exportedAt: new Date().toISOString(),
    zaloAccounts: state.zaloAccounts || [],
    groups: (state.groups || []).map((g) => ({
      id: g.id,
      name: g.name,
      phone: g.phone,
      segment: g.segment,
      tags: g.tags,
      owner: g.owner,
      zaloGroupId: g.zaloGroupId,
      chatType: g.chatType,
      zaloAccountId: g.zaloAccountId,
      lastInteractionAt: g.lastInteractionAt,
      customerNote: g.customerNote,
    })),
    campaigns: state.campaigns || [],
    counts: {
      groups: (state.groups || []).length,
      templates: (state.messageTemplates || []).length,
    },
  };
}

module.exports = {
  DEFAULT_SEGMENTS,
  DEFAULT_TAGS,
  emptyCrmSlice,
  normalizeGroupProfile,
  normalizeCrmState,
  appendInteraction,
  applyAutoRules,
  assignZaloAccount,
  buildExportPayload,
};
