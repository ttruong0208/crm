function initCrmInboxUi(deps) {
  const { getState, escapeHtml, onOpenProfile, onAiReply } = deps;
  const wrap = document.getElementById("crm-inbox-list");
  const accountFilter = document.getElementById("crm-inbox-account");
  const searchInput = document.getElementById("crm-inbox-search");
  if (!wrap) return null;

  function accountName(id) {
    if (!id) return "—";
    return getState().zaloAccounts?.find((a) => a.id === id)?.name || id;
  }

  function segmentLabel(id) {
    return getState().segments?.find((s) => s.id === id)?.name || id || "—";
  }

  function render() {
    const q = (searchInput?.value || "").trim().toLowerCase();
    const acc = accountFilter?.value || "all";
    let rows = [...(getState().groups || [])];
    if (acc !== "all") rows = rows.filter((g) => g.zaloAccountId === acc);
    if (q) {
      rows = rows.filter(
        (g) =>
          g.name?.toLowerCase().includes(q) ||
          g.phone?.includes(q) ||
          g.zaloGroupId?.includes(q),
      );
    }
    rows.sort((a, b) => {
      const ta = a.lastInteractionAt ? new Date(a.lastInteractionAt).getTime() : 0;
      const tb = b.lastInteractionAt ? new Date(b.lastInteractionAt).getTime() : 0;
      return tb - ta;
    });

    if (accountFilter) {
      const opts = (getState().zaloAccounts || [])
        .map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`)
        .join("");
      accountFilter.innerHTML = `<option value="all">Tất cả tài khoản</option>${opts}`;
      if (acc !== "all") accountFilter.value = acc;
    }

    wrap.innerHTML =
      rows
        .slice(0, 100)
        .map((g) => {
          const last = g.interactions?.[0];
          const preview = last
            ? `${new Date(last.at).toLocaleString()} — ${last.summary}`
            : "Chưa có tương tác ghi nhận";
          const type = g.chatType === "user" ? "Cá nhân" : g.chatType === "unknown" ? "?" : "Nhóm";
          return `<li class="list-item crm-inbox-item">
            <div>
              <strong>${escapeHtml(g.name)}</strong>
              <span class="badge">${escapeHtml(type)}</span>
              <span class="badge">${escapeHtml(segmentLabel(g.segment))}</span>
              ${g.aiPriority ? `<span class="badge badge--${escapeHtml(g.aiPriority)}">AI ${escapeHtml(g.aiPriority)}</span>` : ""}
              <div class="item-meta">${escapeHtml(accountName(g.zaloAccountId))}${g.phone ? ` · ${escapeHtml(g.phone)}` : ""}</div>
              <div class="item-meta crm-inbox-preview">${escapeHtml(preview)}</div>
              ${g.aiSummary ? `<div class="item-meta ai-inline-summary">🤖 ${escapeHtml(String(g.aiSummary).slice(0, 100))}${String(g.aiSummary).length > 100 ? "…" : ""}</div>` : ""}
              ${typeof buildZaloChatUrl === "function" ? `<a href="${escapeHtml(buildZaloChatUrl(g))}" target="_blank" rel="noopener" class="zalo-open-chat">💬 Mở Zalo</a>` : ""}
            </div>
            <div class="crm-inbox-actions">
              <button type="button" class="secondary mini" data-inbox-ai-reply="${g.id}">🤖 Trả lời AI</button>
              <button type="button" class="secondary mini" data-inbox-profile="${g.id}">Hồ sơ</button>
            </div>
          </li>`;
        })
        .join("") || `<li class="item-meta">Không có hội thoại.</li>`;
  }

  wrap.addEventListener("click", (e) => {
    const aiBtn = e.target.closest("[data-inbox-ai-reply]");
    if (aiBtn) {
      const gid = aiBtn.getAttribute("data-inbox-ai-reply");
      const g = getState().groups?.find((x) => x.id === gid);
      onAiReply?.(gid, g?.interactions?.[0]?.summary || "");
      return;
    }
    const btn = e.target.closest("[data-inbox-profile]");
    if (btn) onOpenProfile?.(btn.getAttribute("data-inbox-profile"));
  });
  searchInput?.addEventListener("input", render);
  accountFilter?.addEventListener("change", render);

  return { render };
}

window.initCrmInboxUi = initCrmInboxUi;
