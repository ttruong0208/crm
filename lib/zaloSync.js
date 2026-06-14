const crypto = require("crypto");
const { appendInteraction } = require("./crmExtensions");

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function generateSyncToken() {
  return crypto.randomBytes(24).toString("hex");
}

function findGroup(groups, { groupName, zaloGroupId }) {
  const list = groups || [];
  const id = String(zaloGroupId || "").trim();
  if (id) {
    const byId = list.find((g) => g.zaloGroupId === id);
    if (byId) return byId;
  }
  const nameKey = normalizeName(groupName);
  if (!nameKey) return null;
  return list.find((g) => normalizeName(g.name) === nameKey) || null;
}

function markBroadcastSent(state, payload = {}) {
  const groupName = payload.groupName || payload.chatTitle || "";
  const zaloGroupId = payload.zaloGroupId || payload.chatId || "";
  const broadcastId = payload.broadcastId;
  const now = Date.now();
  const isoNow = new Date(now).toISOString();

  if (!broadcastId) {
    return { ok: false, error: "Missing broadcastId", code: "NO_BROADCAST" };
  }

  const broadcast = (state.broadcasts || []).find((b) => b.id === broadcastId);
  if (!broadcast) {
    return { ok: false, error: "Broadcast not found", code: "BROADCAST_NOT_FOUND" };
  }

  const group = findGroup(state.groups, { groupName, zaloGroupId });
  if (!group) {
    return {
      ok: false,
      error: "Group not found in CRM",
      code: "GROUP_NOT_FOUND",
      groupName,
      zaloGroupId,
    };
  }

  const rec = broadcast.recipients?.[group.id];
  if (!rec) {
    return {
      ok: false,
      error: "Group not in broadcast",
      code: "RECIPIENT_NOT_FOUND",
      groupId: group.id,
    };
  }

  rec.status = "sent";
  rec.sentAt = rec.sentAt || now;

  const preview = String(payload.messagePreview || broadcast.message || "").trim().slice(0, 200);
  const gIdx = state.groups.findIndex((g) => g.id === group.id);
  if (gIdx >= 0) {
    state.groups[gIdx] = appendInteraction(state.groups[gIdx], {
      type: "sent",
      summary: preview ? `TB hàng loạt: ${preview}` : `TB hàng loạt — ${broadcast.title}`,
      by: "zalo-sync",
    });
  }

  state.zaloSync = {
    ...(state.zaloSync || {}),
    enabled: true,
    lastSyncAt: isoNow,
    lastGroupName: group.name,
    lastEvent: "broadcast-sent",
  };

  return {
    ok: true,
    groupId: group.id,
    groupName: group.name,
    broadcastId,
    status: "sent",
    syncedAt: isoNow,
  };
}

function markGroupSent(state, payload = {}) {
  if (payload.broadcastId) {
    return markBroadcastSent(state, payload);
  }

  const groupName = payload.groupName || payload.chatTitle || "";
  const zaloGroupId = payload.zaloGroupId || payload.chatId || "";
  const campaignId = payload.campaignId || state.activeCampaignId;
  const now = Date.now();
  const isoNow = new Date(now).toISOString();

  if (!campaignId) {
    return { ok: false, error: "No active campaign", code: "NO_CAMPAIGN" };
  }

  const group = findGroup(state.groups, { groupName, zaloGroupId });
  if (!group) {
    return {
      ok: false,
      error: "Group not found in CRM",
      code: "GROUP_NOT_FOUND",
      groupName,
      zaloGroupId,
    };
  }

  const tasks = state.tasksByCampaign?.[campaignId] || [];
  const task = tasks.find((t) => t.groupId === group.id);
  if (!task) {
    return {
      ok: false,
      error: "No task for this group in campaign",
      code: "TASK_NOT_FOUND",
      groupId: group.id,
      campaignId,
    };
  }

  const previousStatus = task.status;
  task.status = "sent";
  task.sentAt = task.sentAt || isoNow;
  task.lastContactAt = isoNow;
  task.updatedAt = now;

  const preview = String(payload.messagePreview || "").trim().slice(0, 200);
  const gIdx = state.groups.findIndex((g) => g.id === group.id);
  if (gIdx >= 0) {
    state.groups[gIdx] = appendInteraction(state.groups[gIdx], {
      type: "sent",
      summary: preview ? `Đã gửi: ${preview}` : `Đã gửi tin — chiến dịch ${campaignId}`,
      by: "zalo-sync",
    });
  }

  state.zaloSync = {
    ...(state.zaloSync || {}),
    enabled: true,
    lastSyncAt: isoNow,
    lastGroupName: group.name,
    lastEvent: "sent",
  };

  return {
    ok: true,
    groupId: group.id,
    groupName: group.name,
    taskId: task.id,
    campaignId,
    previousStatus,
    status: task.status,
    syncedAt: isoNow,
  };
}

module.exports = {
  normalizeName,
  findGroup,
  generateSyncToken,
  markGroupSent,
  markBroadcastSent,
};
