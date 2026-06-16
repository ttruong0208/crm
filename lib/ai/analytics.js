const { computeAssigneeAnalytics } = require("../analytics");
const { chatCompletion } = require("./provider");

function buildCampaignSnapshot(state, campaignId) {
  const campaigns = state.campaigns || [];
  const activeId = campaignId || state.activeCampaignId || campaigns[0]?.id;
  const campaign = campaigns.find((c) => c.id === activeId) || null;
  const tasks = activeId ? state.tasksByCampaign?.[activeId] || [] : [];

  const summary = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === "pending").length,
    sent: tasks.filter((t) => t.status === "sent").length,
    replying: tasks.filter((t) => t.status === "replying").length,
    done: tasks.filter((t) => t.status === "done").length,
    hot: tasks.filter((t) => t.priority === "hot").length,
    warm: tasks.filter((t) => t.priority === "warm").length,
    cold: tasks.filter((t) => t.priority === "cold").length,
  };

  const campaignStats = campaigns.map((c) => {
    const rows = state.tasksByCampaign?.[c.id] || [];
    const sent = rows.filter((t) => t.status === "sent" || t.status === "replying" || t.status === "done").length;
    const done = rows.filter((t) => t.status === "done").length;
    const replied = rows.filter((t) => t.status === "replying" || t.status === "done").length;
    return {
      id: c.id,
      name: c.name,
      totalGroups: rows.length,
      sent,
      replied,
      done,
      responseRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
    };
  });

  const assigneeRows = activeId ? computeAssigneeAnalytics(state, activeId) : [];

  return {
    campaign: campaign ? { id: campaign.id, name: campaign.name } : null,
    summary,
    campaignStats,
    assigneeRows,
    groupCount: (state.groups || []).length,
  };
}

async function answerAnalyticsQuestion({ question, state, campaignId }) {
  const snapshot = buildCampaignSnapshot(state, campaignId);

  const answer = await chatCompletion({
    system:
      "Bạn là cố vấn vận hành CRM Zalo. Trả lời tiếng Việt, ngắn gọn, có bullet nếu cần. Chỉ dựa trên số liệu JSON được cung cấp. Nếu thiếu dữ liệu, nói rõ.",
    user: `Câu hỏi: ${question}\n\nDữ liệu CRM:\n${JSON.stringify(snapshot, null, 2)}`,
    temperature: 0.3,
  });

  return { answer, snapshot };
}

module.exports = {
  buildCampaignSnapshot,
  answerAnalyticsQuestion,
};
