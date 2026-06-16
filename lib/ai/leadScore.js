const { chatJson } = require("./provider");

function normalizePriority(value) {
  const v = String(value || "").toLowerCase();
  if (v === "hot" || v === "warm" || v === "cold") return v;
  return "warm";
}

function scoreFromPriority(priority) {
  if (priority === "hot") return 85;
  if (priority === "cold") return 25;
  return 55;
}

async function analyzeLeadFromMessages({ groupName, messages = [], interactions = [] }) {
  const transcript = messages
    .slice(-20)
    .map((m) => {
      const role = m.role || m.from || "user";
      const text = m.text || m.summary || m.message || "";
      return `${role}: ${text}`;
    })
    .join("\n");

  const history = interactions
    .slice(0, 10)
    .map((i) => `${i.type || "note"}: ${i.summary || ""}`)
    .join("\n");

  const data = await chatJson({
    system:
      "Bạn phân loại lead Zalo cho CRM Việt Nam. Trả JSON. priority: hot nếu hỏi giá/mua/đặt hàng; warm nếu quan tâm; cold nếu lờ mờ/từ chối/chỉ react.",
    user: JSON.stringify({
      groupName: groupName || "Khách",
      transcript: transcript || history || "Chưa có tin nhắn",
      recentNotes: history,
      output: {
        priority: "hot|warm|cold",
        leadScore: "0-100 number",
        intent: "string ngắn",
        summary: "2-3 câu tóm tắt cho nhân viên mới tiếp quản",
        suggestedTags: ["string"],
      },
    }),
  });

  const priority = normalizePriority(data.priority);
  const leadScore = Math.max(0, Math.min(100, Number(data.leadScore) || scoreFromPriority(priority)));

  return {
    priority,
    leadScore,
    intent: String(data.intent || "").slice(0, 200),
    summary: String(data.summary || "").slice(0, 600),
    suggestedTags: Array.isArray(data.suggestedTags)
      ? data.suggestedTags.map((t) => String(t).slice(0, 40)).slice(0, 5)
      : [],
  };
}

async function summarizeConversation({ groupName, messages = [], interactions = [] }) {
  const result = await analyzeLeadFromMessages({ groupName, messages, interactions });
  return { summary: result.summary, intent: result.intent };
}

module.exports = {
  analyzeLeadFromMessages,
  summarizeConversation,
  normalizePriority,
  scoreFromPriority,
};
