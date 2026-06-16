const { chatJson } = require("./provider");
const { searchKnowledge } = require("./knowledge");

async function suggestReplies({ incomingMessage, groupName, knowledgeDocs = [], groupContext = "" }) {
  const snippets = searchKnowledge(knowledgeDocs, incomingMessage, 4);

  const data = await chatJson({
    system:
      "Bạn là nhân viên CSKH Zalo chuyên nghiệp, thân thiện, ngắn gọn. Chỉ dùng thông tin trong knowledge snippets. Nếu thiếu dữ liệu, hỏi lại lịch sự. Không hứa giá/khuyến mãi không có trong dữ liệu.",
    user: JSON.stringify({
      groupName: groupName || "Khách",
      incomingMessage,
      groupContext,
      knowledgeSnippets: snippets,
      output: {
        replies: [{ label: "string", text: "string" }],
      },
    }),
  });

  const replies = Array.isArray(data.replies) ? data.replies : [];
  return {
    replies: replies
      .slice(0, 3)
      .map((r, idx) => ({
        label: String(r.label || `Gợi ý ${idx + 1}`).slice(0, 40),
        text: String(r.text || "").trim().slice(0, 1200),
      }))
      .filter((r) => r.text),
    snippetsUsed: snippets,
  };
}

module.exports = { suggestReplies };
