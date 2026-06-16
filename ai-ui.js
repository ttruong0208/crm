/** AI features: content, lead score, smart reply, analytics */
function initAiUi(deps) {
  const {
    getState,
    refreshState,
    renderAll,
    escapeHtml,
    insertIntoFocusedMessage,
    getActiveCampaignId,
    getCurrentUser,
  } = deps;

  let usageSnapshot = null;
  let replyGroupId = null;

  const els = {
    usageLine: document.getElementById("ai-usage-line"),
    contentForm: document.getElementById("ai-content-form"),
    contentBrief: document.getElementById("ai-content-brief"),
    contentResults: document.getElementById("ai-content-results"),
    contentSubmit: document.getElementById("ai-content-submit"),
    analyticsForm: document.getElementById("ai-analytics-form"),
    analyticsQuestion: document.getElementById("ai-analytics-question"),
    analyticsAnswer: document.getElementById("ai-analytics-answer"),
    analyticsSubmit: document.getElementById("ai-analytics-submit"),
    analyticsChips: document.getElementById("ai-analytics-chips"),
    knowledgeList: document.getElementById("ai-knowledge-list"),
    knowledgeForm: document.getElementById("ai-knowledge-form"),
    knowledgeId: document.getElementById("ai-knowledge-id"),
    knowledgeTitle: document.getElementById("ai-knowledge-title"),
    knowledgeText: document.getElementById("ai-knowledge-text"),
    knowledgeReset: document.getElementById("ai-knowledge-reset"),
    profileAiMeta: document.getElementById("crm-profile-ai-meta"),
    profileAiScore: document.getElementById("crm-profile-ai-score"),
    profileAiSummarize: document.getElementById("crm-profile-ai-summarize"),
    replyModal: document.getElementById("ai-reply-modal"),
    replyGroupName: document.getElementById("ai-reply-group-name"),
    replyIncoming: document.getElementById("ai-reply-incoming"),
    replyGenerate: document.getElementById("ai-reply-generate"),
    replyResults: document.getElementById("ai-reply-results"),
    replyClose: document.getElementById("ai-reply-close"),
    taskWrap: document.getElementById("task-table-wrap"),
  };

  function aiFeatureEnabled(key) {
    return typeof planHasFeature === "function" ? planHasFeature(key) : true;
  }

  function showAiError(err, fallback) {
    const msg = typeof err === "string" ? err : err?.error || fallback || "Lỗi AI";
    if (err?.code === "PLAN_FEATURE_AI" || err?.code === "AI_DAILY_LIMIT") {
      if (typeof notifyPlanBlocked === "function") {
        notifyPlanBlocked(err.code === "AI_DAILY_LIMIT" ? "aiLimit" : keyFromFeature(err));
      }
    }
    alert(msg);
  }

  function keyFromFeature() {
    return "aiContent";
  }

  async function loadUsage() {
    try {
      const res = await apiFetch("/api/ai/usage");
      if (!res.ok) return;
      usageSnapshot = await res.json();
      renderUsageLine();
      applyAiPanelVisibility();
    } catch {
      /* ignore */
    }
  }

  function renderUsageLine() {
    if (!els.usageLine || !usageSnapshot) return;
    if (!usageSnapshot.configured) {
      els.usageLine.textContent =
        "AI chưa bật trên server — admin cần thêm OPENAI_API_KEY trên Vercel.";
      return;
    }
    const r = usageSnapshot.remaining || {};
    const parts = [
      `Soạn tin ${r.content ?? "?"}`,
      `Lead ${r.leadScore ?? "?"}`,
      `Trả lời ${r.smartReply ?? "?"}`,
      `Phân tích ${r.analytics ?? "?"}`,
    ];
    els.usageLine.textContent = `Lượt AI còn hôm nay: ${parts.join(" · ")} (${usageSnapshot.provider || "openai"})`;
  }

  function applyAiPanelVisibility() {
    document.getElementById("ai-content-panel")?.classList.toggle("ai-panel--locked", !aiFeatureEnabled("aiContent"));
    document.getElementById("ai-analytics-panel")?.classList.toggle("ai-panel--locked", !aiFeatureEnabled("aiAnalytics"));
    document.getElementById("ai-knowledge-block")?.classList.toggle("hidden", getCurrentUser()?.role !== "admin");
  }

  async function parseApiError(res) {
    try {
      return await res.json();
    } catch {
      return { error: res.statusText || "Lỗi API" };
    }
  }

  function renderVariantResults(container, variants, ctaIdeas, onPick) {
    if (!container) return;
    const ctaHtml =
      ctaIdeas?.length > 0
        ? `<p class="item-meta"><strong>CTA gợi ý:</strong> ${ctaIdeas.map((c) => escapeHtml(c)).join(" · ")}</p>`
        : "";
    container.innerHTML =
      (variants || [])
        .map(
          (v, idx) => `<article class="ai-variant-card">
          <div class="ai-variant-head"><span class="badge">${escapeHtml(v.tone || `Mẫu ${idx + 1}`)}</span></div>
          <p class="ai-variant-text">${escapeHtml(v.text)}</p>
          ${v.cta ? `<p class="item-meta">CTA: ${escapeHtml(v.cta)}</p>` : ""}
          <button type="button" class="secondary mini" data-ai-pick="${idx}">Chèn vào ô tin</button>
        </article>`,
        )
        .join("") + ctaHtml;
    container.classList.remove("hidden");
    container.querySelectorAll("[data-ai-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-ai-pick"));
        const variant = variants[idx];
        if (variant?.text) onPick?.(variant.text);
      });
    });
  }

  function renderReplyResults(container, replies) {
    if (!container) return;
    container.innerHTML = (replies || [])
      .map(
        (r, idx) => `<article class="ai-variant-card">
        <div class="ai-variant-head"><span class="badge">${escapeHtml(r.label || `Gợi ý ${idx + 1}`)}</span></div>
        <p class="ai-variant-text">${escapeHtml(r.text)}</p>
        <button type="button" class="secondary mini" data-ai-copy-reply="${idx}">Copy</button>
        <button type="button" class="mini" data-ai-use-reply="${idx}">Dùng làm tin trả lời</button>
      </article>`,
      )
      .join("");
    container.classList.remove("hidden");
    container.querySelectorAll("[data-ai-copy-reply]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.getAttribute("data-ai-copy-reply"));
        const text = replies[idx]?.text;
        if (text) {
          await navigator.clipboard.writeText(text);
          alert("Đã copy gợi ý trả lời.");
        }
      });
    });
    container.querySelectorAll("[data-ai-use-reply]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-ai-use-reply"));
        const text = replies[idx]?.text;
        if (text) {
          insertIntoFocusedMessage?.(text);
          closeReplyModal();
        }
      });
    });
  }

  async function runContentGeneration(brief) {
    if (!aiFeatureEnabled("aiContent")) {
      if (typeof notifyPlanBlocked === "function") notifyPlanBlocked("aiContent");
      return;
    }
    if (!brief) {
      alert("Nhập ý chính / brief trước.");
      return;
    }
    els.contentSubmit.disabled = true;
    els.contentSubmit.textContent = "Đang tạo…";
    try {
      const res = await apiFetch("/api/ai/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, count: 5, includeCta: true }),
      });
      const data = await parseApiError(res);
      if (!res.ok) {
        showAiError(data, "Không tạo được mẫu tin");
        return;
      }
      usageSnapshot = { ...usageSnapshot, ...data.usage, configured: true };
      renderUsageLine();
      renderVariantResults(els.contentResults, data.variants, data.ctaIdeas, (text) => {
        insertIntoFocusedMessage?.(text);
        alert("Đã chèn vào ô tin đang chọn.");
      });
    } finally {
      els.contentSubmit.disabled = false;
      els.contentSubmit.textContent = "Tạo mẫu tin";
    }
  }

  async function runAnalytics(question) {
    if (!aiFeatureEnabled("aiAnalytics")) {
      if (typeof notifyPlanBlocked === "function") notifyPlanBlocked("aiAnalytics");
      return;
    }
    const q = String(question || "").trim();
    if (!q) return;
    els.analyticsSubmit.disabled = true;
    els.analyticsAnswer.classList.remove("hidden");
    els.analyticsAnswer.innerHTML = `<p class="item-meta">Đang phân tích…</p>`;
    try {
      const res = await apiFetch("/api/ai/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, campaignId: getActiveCampaignId?.() }),
      });
      const data = await parseApiError(res);
      if (!res.ok) {
        showAiError(data, "Không phân tích được");
        els.analyticsAnswer.classList.add("hidden");
        return;
      }
      usageSnapshot = { ...usageSnapshot, ...data.usage, configured: true };
      renderUsageLine();
      els.analyticsAnswer.innerHTML = `<div class="ai-answer-text">${escapeHtml(data.answer || "").replace(/\n/g, "<br>")}</div>`;
    } finally {
      els.analyticsSubmit.disabled = false;
    }
  }

  async function runLeadScore(groupId, { summarizeOnly } = {}) {
    if (!aiFeatureEnabled("aiLeadScore")) {
      if (typeof notifyPlanBlocked === "function") notifyPlanBlocked("aiLeadScore");
      return;
    }
    const group = getState().groups?.find((g) => g.id === groupId);
    if (!group) return;

    const messages = (group.interactions || [])
      .slice(0, 15)
      .map((ix) => ({ role: "note", text: ix.summary || "" }));

    const endpoint = summarizeOnly ? "/api/ai/summarize" : "/api/ai/lead-score";
    const res = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, messages }),
    });
    const data = await parseApiError(res);
    if (!res.ok) {
      showAiError(data, "AI lead score thất bại");
      return null;
    }
    await refreshState?.();
    await loadUsage();
    renderProfileAiMeta(groupId);
    renderAll?.();
    return data;
  }

  async function runSuggestReply() {
    if (!aiFeatureEnabled("aiSmartReply")) {
      if (typeof notifyPlanBlocked === "function") notifyPlanBlocked("aiSmartReply");
      return;
    }
    const incoming = els.replyIncoming?.value.trim();
    if (!incoming) {
      alert("Nhập tin khách cần trả lời.");
      return;
    }
    els.replyGenerate.disabled = true;
    els.replyGenerate.textContent = "Đang gợi ý…";
    try {
      const res = await apiFetch("/api/ai/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: replyGroupId, incomingMessage: incoming }),
      });
      const data = await parseApiError(res);
      if (!res.ok) {
        showAiError(data, "Không gợi ý được trả lời");
        return;
      }
      usageSnapshot = { ...usageSnapshot, ...data.usage, configured: true };
      renderUsageLine();
      renderReplyResults(els.replyResults, data.replies);
    } finally {
      els.replyGenerate.disabled = false;
      els.replyGenerate.textContent = "Tạo gợi ý";
    }
  }

  function renderProfileAiMeta(groupId) {
    if (!els.profileAiMeta) return;
    const g = getState().groups?.find((x) => x.id === groupId);
    if (!g) {
      els.profileAiMeta.textContent = "";
      return;
    }
    const parts = [];
    if (g.aiSummary) parts.push(`Tóm tắt: ${g.aiSummary}`);
    if (g.aiIntent) parts.push(`Ý định: ${g.aiIntent}`);
    if (g.aiPriority) parts.push(`Độ nóng AI: ${g.aiPriority}`);
    if (g.aiScoredAt) parts.push(`Cập nhật: ${new Date(g.aiScoredAt).toLocaleString("vi-VN")}`);
    els.profileAiMeta.textContent = parts.join(" · ") || "Chưa có phân tích AI — bấm Chấm lead hoặc Tóm tắt.";
  }

  function openReplyModal(groupId, presetMessage) {
    const g = getState().groups?.find((x) => x.id === groupId);
    if (!g || !els.replyModal) return;
    replyGroupId = groupId;
    els.replyGroupName.textContent = g.name || groupId;
    els.replyIncoming.value = presetMessage || g.interactions?.[0]?.summary || "";
    els.replyResults?.classList.add("hidden");
    els.replyResults.innerHTML = "";
    els.replyModal.classList.remove("hidden");
  }

  function closeReplyModal() {
    els.replyModal?.classList.add("hidden");
    replyGroupId = null;
  }

  async function loadKnowledgeList() {
    if (!els.knowledgeList || getCurrentUser()?.role !== "admin") return;
    try {
      const res = await apiFetch("/api/ai/knowledge");
      if (!res.ok) return;
      const data = await res.json();
      const docs = data.documents || [];
      els.knowledgeList.innerHTML =
        docs
          .map(
            (d) => `<li class="list-item ai-knowledge-item">
            <div>
              <strong>${escapeHtml(d.title || "Tài liệu")}</strong>
              <div class="item-meta">${escapeHtml(String(d.text || "").slice(0, 120))}${(d.text || "").length > 120 ? "…" : ""}</div>
            </div>
            <div class="ai-btn-row">
              <button type="button" class="secondary mini" data-ai-kb-edit="${escapeHtml(d.id)}">Sửa</button>
              <button type="button" class="secondary mini" data-ai-kb-del="${escapeHtml(d.id)}">Xóa</button>
            </div>
          </li>`,
          )
          .join("") || `<li class="item-meta">Chưa có tài liệu — thêm FAQ sản phẩm bên dưới.</li>`;
    } catch {
      /* ignore */
    }
  }

  function resetKnowledgeForm() {
    if (els.knowledgeId) els.knowledgeId.value = "";
    if (els.knowledgeTitle) els.knowledgeTitle.value = "";
    if (els.knowledgeText) els.knowledgeText.value = "";
  }

  els.contentForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    runContentGeneration(els.contentBrief?.value.trim());
  });

  els.analyticsForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    runAnalytics(els.analyticsQuestion?.value);
  });

  els.analyticsChips?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-ai-analytics-q]");
    if (!btn) return;
    const q = btn.getAttribute("data-ai-analytics-q");
    if (els.analyticsQuestion) els.analyticsQuestion.value = q;
    runAnalytics(q);
  });

  els.knowledgeForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (getCurrentUser()?.role !== "admin") return;
    const text = els.knowledgeText?.value.trim();
    if (!text) return;
    const res = await apiFetch("/api/ai/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: els.knowledgeId?.value || undefined,
        title: els.knowledgeTitle?.value.trim(),
        text,
      }),
    });
    const data = await parseApiError(res);
    if (!res.ok) {
      alert(data.error || "Lưu thất bại");
      return;
    }
    resetKnowledgeForm();
    loadKnowledgeList();
  });

  els.knowledgeReset?.addEventListener("click", resetKnowledgeForm);

  els.knowledgeList?.addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-ai-kb-edit]");
    const delBtn = e.target.closest("[data-ai-kb-del]");
    if (editBtn) {
      const id = editBtn.getAttribute("data-ai-kb-edit");
      const res = await apiFetch("/api/ai/knowledge");
      if (!res.ok) return;
      const data = await res.json();
      const doc = (data.documents || []).find((d) => d.id === id);
      if (!doc) return;
      els.knowledgeId.value = doc.id;
      els.knowledgeTitle.value = doc.title || "";
      els.knowledgeText.value = doc.text || "";
      return;
    }
    if (delBtn) {
      const id = delBtn.getAttribute("data-ai-kb-del");
      if (!confirm("Xóa tài liệu này?")) return;
      const res = await apiFetch(`/api/ai/knowledge/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) loadKnowledgeList();
    }
  });

  els.profileAiScore?.addEventListener("click", async () => {
    const gid = document.getElementById("crm-profile-group-id")?.value;
    if (!gid) return;
    els.profileAiScore.disabled = true;
    try {
      const data = await runLeadScore(gid);
      if (data?.analysis) {
        alert(
          `Lead: ${data.analysis.priority?.toUpperCase()} · ${data.analysis.leadScore}/100\n${data.analysis.summary || ""}`,
        );
      }
    } finally {
      els.profileAiScore.disabled = false;
    }
  });

  els.profileAiSummarize?.addEventListener("click", async () => {
    const gid = document.getElementById("crm-profile-group-id")?.value;
    if (!gid) return;
    els.profileAiSummarize.disabled = true;
    try {
      const data = await runLeadScore(gid, { summarizeOnly: true });
      if (data?.summary) alert(data.summary);
    } finally {
      els.profileAiSummarize.disabled = false;
    }
  });

  els.replyGenerate?.addEventListener("click", runSuggestReply);
  els.replyClose?.addEventListener("click", closeReplyModal);

  els.taskWrap?.addEventListener("click", (e) => {
    const contentBtn = e.target.closest("[data-ai-content-task]");
    if (contentBtn) {
      const brief = prompt("Nhập ý chính cho AI soạn tin:", "");
      if (brief) runContentGeneration(brief.trim());
      return;
    }
    const scoreBtn = e.target.closest("[data-ai-lead-score]");
    if (scoreBtn) {
      const gid = scoreBtn.getAttribute("data-ai-lead-score");
      if (gid) runLeadScore(gid);
    }
  });

  document.addEventListener("crm-profile-opened", (ev) => {
    renderProfileAiMeta(ev.detail?.groupId);
  });

  loadUsage();
  loadKnowledgeList();

  return {
    refresh: () => {
      loadUsage();
      loadKnowledgeList();
      applyAiPanelVisibility();
    },
    openReplyModal,
    closeReplyModal,
    runLeadScore,
    renderProfileAiMeta,
  };
}

window.initAiUi = initAiUi;
