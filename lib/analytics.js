function toTimestamp(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function formatDuration(ms) {
  if (!ms || ms < 0) return "—";
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours >= 24) return `${Math.floor(hours / 24)} ngày`;
  if (hours > 0) return `${hours}h ${mins}p`;
  return `${mins} phút`;
}

function computeAssigneeAnalytics(state, campaignId) {
  const tasks = state.tasksByCampaign?.[campaignId] || [];
  const byAssignee = new Map();

  for (const task of tasks) {
    const name = String(task.assignee || "").trim() || "(Chưa gán)";
    if (!byAssignee.has(name)) {
      byAssignee.set(name, {
        assignee: name,
        total: 0,
        pending: 0,
        sent: 0,
        replied: 0,
        done: 0,
        hot: 0,
        responseTimes: [],
      });
    }
    const row = byAssignee.get(name);
    row.total += 1;
    if (task.status === "pending") row.pending += 1;
    if (task.status === "sent") row.sent += 1;
    if (task.status === "replying") row.replied += 1;
    if (task.status === "done") {
      row.done += 1;
      row.replied += 1;
    }
    if (task.priority === "hot") row.hot += 1;

    const sentAt = toTimestamp(task.sentAt);
    const repliedAt = toTimestamp(task.repliedAt) || toTimestamp(task.lastContactAt);
    if (sentAt && repliedAt && repliedAt > sentAt) {
      row.responseTimes.push(repliedAt - sentAt);
    }
  }

  const rows = [...byAssignee.values()].map((row) => {
    const outreach = row.sent + row.replied + row.done;
    const responses = row.replied + row.done;
    const responseRate = outreach > 0 ? Math.round((responses / outreach) * 100) : 0;
    const avgMs =
      row.responseTimes.length > 0
        ? Math.round(row.responseTimes.reduce((a, b) => a + b, 0) / row.responseTimes.length)
        : null;
    return {
      assignee: row.assignee,
      total: row.total,
      pending: row.pending,
      sent: row.sent,
      replied: row.replied,
      done: row.done,
      hot: row.hot,
      responseRate,
      avgResponseMs: avgMs,
      avgResponseLabel: formatDuration(avgMs),
    };
  });

  rows.sort((a, b) => b.total - a.total);
  return rows;
}

module.exports = {
  computeAssigneeAnalytics,
  formatDuration,
};
