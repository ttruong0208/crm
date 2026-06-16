const { getWorkspaceState, saveAppState, getWorkspaceId } = require("../db");
const { normalizeCrmState, appendInteraction } = require("../crmExtensions");
const { getPlanFromSettings } = require("../plans");
const { generateContentVariants } = require("./content");
const { analyzeLeadFromMessages, summarizeConversation } = require("./leadScore");
const { suggestReplies } = require("./smartReply");
const { answerAnalyticsQuestion } = require("./analytics");
const {
  normalizeKnowledgeBase,
  upsertKnowledgeDocument,
  deleteKnowledgeDocument,
} = require("./knowledge");
const { assertAiAllowed, incrementAiUsage, getAiUsageSnapshot } = require("./usage");

function applyLeadAnalysisToState(state, groupId, analysis) {
  const next = { ...state };
  const gIdx = (next.groups || []).findIndex((g) => g.id === groupId);
  if (gIdx >= 0) {
    next.groups = [...next.groups];
    next.groups[gIdx] = {
      ...next.groups[gIdx],
      aiSummary: analysis.summary,
      aiIntent: analysis.intent,
      aiPriority: analysis.priority,
      aiScoredAt: new Date().toISOString(),
    };
  }

  const campaignId = next.activeCampaignId;
  if (campaignId && next.tasksByCampaign?.[campaignId]) {
    next.tasksByCampaign = { ...next.tasksByCampaign };
    next.tasksByCampaign[campaignId] = next.tasksByCampaign[campaignId].map((task) => {
      if (task.groupId !== groupId) return task;
      return {
        ...task,
        priority: analysis.priority || task.priority,
        leadScore: analysis.leadScore ?? task.leadScore,
      };
    });
  }

  return next;
}

async function persistState(user, state) {
  const normalized = normalizeCrmState(state);
  await saveAppState(getWorkspaceId(user), normalized);
  return normalized;
}

function registerAiRoutes(app, authRequired) {
  app.get("/api/ai/usage", authRequired, async (req, res) => {
    try {
      const state = await getWorkspaceState(req.user);
      return res.json({ ok: true, ...getAiUsageSnapshot(state) });
    } catch (error) {
      console.error("AI usage error:", error);
      return res.status(500).json({ error: "Không đọc được hạn mức AI" });
    }
  });

  app.get("/api/ai/knowledge", authRequired, async (req, res) => {
    try {
      const state = await getWorkspaceState(req.user);
      const kb = normalizeKnowledgeBase(state);
      return res.json({ ok: true, documents: kb.documents });
    } catch (error) {
      return res.status(500).json({ error: "Không tải kho tri thức" });
    }
  });

  app.post("/api/ai/knowledge", authRequired, async (req, res) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Chỉ admin quản lý kho tri thức AI" });
      }
      let state = await getWorkspaceState(req.user);

      const title = String(req.body?.title || "").trim();
      const text = String(req.body?.text || "").trim();
      if (!text) return res.status(400).json({ error: "Nội dung tài liệu là bắt buộc" });

      state.aiKnowledgeBase = upsertKnowledgeDocument(state, {
        id: req.body?.id,
        title: title || "Sản phẩm / FAQ",
        text,
      });
      state = await persistState(req.user, state);
      return res.json({ ok: true, documents: normalizeKnowledgeBase(state).documents });
    } catch (error) {
      console.error("AI knowledge save error:", error);
      return res.status(500).json({ error: error.message || "Lưu tài liệu thất bại" });
    }
  });

  app.delete("/api/ai/knowledge/:id", authRequired, async (req, res) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Chỉ admin quản lý kho tri thức AI" });
      }
      let state = await getWorkspaceState(req.user);
      state.aiKnowledgeBase = deleteKnowledgeDocument(state, req.params.id);
      state = await persistState(req.user, state);
      return res.json({ ok: true, documents: normalizeKnowledgeBase(state).documents });
    } catch (error) {
      return res.status(500).json({ error: "Xóa tài liệu thất bại" });
    }
  });

  app.post("/api/ai/content", authRequired, async (req, res) => {
    try {
      let state = await getWorkspaceState(req.user);
      const block = assertAiAllowed(state, "aiContent");
      if (block) return res.status(block.status).json(block.body);

      const brief = String(req.body?.brief || req.body?.idea || "").trim();
      if (!brief) return res.status(400).json({ error: "Nhập ý chính / brief" });

      const result = await generateContentVariants({
        brief,
        count: Number(req.body?.count || 5),
        includeCta: req.body?.includeCta !== false,
        tones: Array.isArray(req.body?.tones) ? req.body.tones : undefined,
      });

      state.crmSettings = incrementAiUsage(state.crmSettings, "aiContent");
      await persistState(req.user, state);

      return res.json({ ok: true, ...result, usage: getAiUsageSnapshot(state) });
    } catch (error) {
      console.error("AI content error:", error);
      return res.status(500).json({ error: error.message || "AI soạn tin thất bại" });
    }
  });

  app.post("/api/ai/lead-score", authRequired, async (req, res) => {
    try {
      let state = await getWorkspaceState(req.user);
      const block = assertAiAllowed(state, "aiLeadScore");
      if (block) return res.status(block.status).json(block.body);

      const groupId = String(req.body?.groupId || "");
      const group = (state.groups || []).find((g) => g.id === groupId);
      if (!group) return res.status(404).json({ error: "Không tìm thấy nhóm" });

      const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const interactions = group.interactions || [];

      const analysis = await analyzeLeadFromMessages({
        groupName: group.name,
        messages,
        interactions,
      });

      state = applyLeadAnalysisToState(state, groupId, analysis);
      state.crmSettings = incrementAiUsage(state.crmSettings, "aiLeadScore");
      state = await persistState(req.user, state);

      return res.json({ ok: true, analysis, usage: getAiUsageSnapshot(state) });
    } catch (error) {
      console.error("AI lead score error:", error);
      return res.status(500).json({ error: error.message || "AI phân loại lead thất bại" });
    }
  });

  app.post("/api/ai/summarize", authRequired, async (req, res) => {
    try {
      let state = await getWorkspaceState(req.user);
      const block = assertAiAllowed(state, "aiLeadScore");
      if (block) return res.status(block.status).json(block.body);

      const groupId = String(req.body?.groupId || "");
      const group = (state.groups || []).find((g) => g.id === groupId);
      if (!group) return res.status(404).json({ error: "Không tìm thấy nhóm" });

      const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const result = await summarizeConversation({
        groupName: group.name,
        messages,
        interactions: group.interactions || [],
      });

      state.crmSettings = incrementAiUsage(state.crmSettings, "aiLeadScore");
      await persistState(req.user, state);

      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error("AI summarize error:", error);
      return res.status(500).json({ error: error.message || "AI tóm tắt thất bại" });
    }
  });

  app.post("/api/ai/suggest-reply", authRequired, async (req, res) => {
    try {
      let state = await getWorkspaceState(req.user);
      const block = assertAiAllowed(state, "aiSmartReply");
      if (block) return res.status(block.status).json(block.body);

      const groupId = String(req.body?.groupId || "");
      const incomingMessage = String(req.body?.incomingMessage || req.body?.message || "").trim();
      if (!incomingMessage) return res.status(400).json({ error: "Nhập tin nhắn khách cần trả lời" });

      const group = (state.groups || []).find((g) => g.id === groupId);
      const kb = normalizeKnowledgeBase(state);
      const result = await suggestReplies({
        incomingMessage,
        groupName: group?.name,
        knowledgeDocs: kb.documents,
        groupContext: group?.aiSummary || group?.customerNote || "",
      });

      state.crmSettings = incrementAiUsage(state.crmSettings, "aiSmartReply");
      await persistState(req.user, state);

      return res.json({ ok: true, ...result, usage: getAiUsageSnapshot(state) });
    } catch (error) {
      console.error("AI suggest reply error:", error);
      return res.status(500).json({ error: error.message || "AI gợi ý trả lời thất bại" });
    }
  });

  app.post("/api/ai/analytics", authRequired, async (req, res) => {
    try {
      let state = await getWorkspaceState(req.user);
      const block = assertAiAllowed(state, "aiAnalytics");
      if (block) return res.status(block.status).json(block.body);

      const question = String(req.body?.question || "").trim();
      if (!question) return res.status(400).json({ error: "Nhập câu hỏi" });

      const { answer, snapshot } = await answerAnalyticsQuestion({
        question,
        state,
        campaignId: req.body?.campaignId || state.activeCampaignId,
      });

      state.crmSettings = incrementAiUsage(state.crmSettings, "aiAnalytics");
      await persistState(req.user, state);

      return res.json({ ok: true, answer, snapshot, usage: getAiUsageSnapshot(state) });
    } catch (error) {
      console.error("AI analytics error:", error);
      return res.status(500).json({ error: error.message || "AI phân tích thất bại" });
    }
  });
}

module.exports = {
  registerAiRoutes,
  applyLeadAnalysisToState,
  persistAiState: persistState,
};
