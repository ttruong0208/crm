/**
 * CRM Full — tài khoản Zalo, tag, hồ sơ KH, mẫu tin, nhắc chăm sóc, export.
 */
function normalizeCrmStateBrowser(state) {
  const defaults = {
    zaloAccounts: [],
    tagCatalog: [
      { id: "tag_hot", name: "Ưu tiên cao", color: "#dc2626" },
      { id: "tag_follow", name: "Cần follow-up", color: "#7c3aed" },
    ],
    segments: [
      { id: "lead", name: "Khách tiềm năng", color: "#3b82f6" },
      { id: "customer", name: "Đã mua", color: "#16a34a" },
      { id: "vip", name: "VIP", color: "#d97706" },
      { id: "inactive", name: "Lâu không tương tác", color: "#64748b" },
    ],
    messageTemplates: [],
    quickReplies: [],
    crmSettings: { webhookUrl: "", inactiveDays: 14, activeZaloAccountId: null },
    extensionHeartbeats: {},
  };
  const next = { ...state };
  for (const key of Object.keys(defaults)) {
    if (key === "crmSettings") {
      next.crmSettings = { ...defaults.crmSettings, ...(state.crmSettings || {}) };
    } else if (!Array.isArray(state[key]) || (key === "tagCatalog" && !state[key]?.length)) {
      next[key] = defaults[key];
    } else {
      next[key] = state[key];
    }
  }
  next.groups = (state.groups || []).map((g) => ({
    ...g,
    phone: g.phone || "",
    segment: g.segment || "lead",
    tags: Array.isArray(g.tags) ? g.tags : [],
    customerNote: g.customerNote || "",
    interactions: Array.isArray(g.interactions) ? g.interactions : [],
    linkedZaloChats: Array.isArray(g.linkedZaloChats) ? g.linkedZaloChats : [],
  }));
  if (!next.extensionHeartbeats || typeof next.extensionHeartbeats !== "object") {
    next.extensionHeartbeats = {};
  }
  return next;
}

function isExtOnline(lastAt) {
  if (!lastAt) return false;
  return Date.now() - new Date(lastAt).getTime() < 10 * 60 * 1000;
}

window.normalizeCrmStateBrowser = normalizeCrmStateBrowser;

function initCrmFullUi(deps) {
  const {
    getState,
    setState,
    saveState,
    renderAll,
    escapeHtml,
    getRole,
    onApplyTemplate,
  } = deps;

  const panel = document.getElementById("crm-full-panel");
  if (!panel) return null;

  const els = {
    accountsList: panel.querySelector("#crm-accounts-list"),
    accountForm: panel.querySelector("#crm-account-form"),
    accountName: panel.querySelector("#crm-account-name"),
    accountPhone: panel.querySelector("#crm-account-phone"),
    tagsList: panel.querySelector("#crm-tags-list"),
    tagForm: panel.querySelector("#crm-tag-form"),
    tagName: panel.querySelector("#crm-tag-name"),
    templatesList: panel.querySelector("#crm-templates-list"),
    templateForm: panel.querySelector("#crm-template-form"),
    templateTitle: panel.querySelector("#crm-template-title"),
    templateBody: panel.querySelector("#crm-template-body"),
    quickList: panel.querySelector("#crm-quick-list"),
    quickForm: panel.querySelector("#crm-quick-form"),
    quickShortcut: panel.querySelector("#crm-quick-shortcut"),
    quickBody: panel.querySelector("#crm-quick-body"),
    careList: panel.querySelector("#crm-care-list"),
    segmentFilter: panel.querySelector("#crm-segment-filter"),
    webhookUrl: panel.querySelector("#crm-webhook-url"),
    inactiveDays: panel.querySelector("#crm-inactive-days"),
    exportBtn: panel.querySelector("#crm-export-json"),
    webhookTest: panel.querySelector("#crm-webhook-test"),
    activeAccount: panel.querySelector("#crm-active-account"),
    profileModal: document.getElementById("crm-profile-modal"),
    profileForm: document.getElementById("crm-profile-form"),
    profileGroupId: document.getElementById("crm-profile-group-id"),
    profilePhone: document.getElementById("crm-profile-phone"),
    profileSegment: document.getElementById("crm-profile-segment"),
    profileNote: document.getElementById("crm-profile-note"),
    profileTags: document.getElementById("crm-profile-tags"),
    profileInteractions: document.getElementById("crm-profile-interactions"),
    profileClose: document.getElementById("crm-profile-close"),
    profileNewInteraction: document.getElementById("crm-profile-new-interaction"),
    profileAddInteraction: document.getElementById("crm-profile-add-interaction"),
  };

  let groupSegmentFilter = "all";

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  function segmentName(id) {
    const s = getState().segments?.find((x) => x.id === id);
    return s?.name || id || "—";
  }

  function groupsForCare() {
    const state = getState();
    const inactiveDays = Number(state.crmSettings?.inactiveDays || 14);
    const now = Date.now();
    const ms = inactiveDays * 86400000;
    return (state.groups || [])
      .map((g) => {
        const last = g.lastInteractionAt ? new Date(g.lastInteractionAt).getTime() : 0;
        const inactive = !last || now - last > ms;
        let dueFollowUp = false;
        for (const tasks of Object.values(state.tasksByCampaign || {})) {
          for (const t of tasks || []) {
            if (t.groupId !== g.id || !t.followUpAt) continue;
            if (new Date(t.followUpAt).getTime() <= now && t.status !== "done") dueFollowUp = true;
          }
        }
        return { group: g, inactive, dueFollowUp };
      })
      .filter((row) => row.inactive || row.dueFollowUp);
  }

  function renderAccounts() {
    const state = getState();
    if (els.accountsList) {
      els.accountsList.innerHTML = (state.zaloAccounts || [])
        .map((a) => {
          const hb = state.extensionHeartbeats?.[a.id];
          const lastAt = hb?.at || a.lastHeartbeatAt;
          const online = isExtOnline(lastAt);
          const extLabel = a.syncToken
            ? online
              ? `<span class="ext-status ext-online">Extension: Online</span>`
              : `<span class="ext-status ext-offline">Extension: Offline</span>`
            : "";
          return `<li class="list-item">
            <div><strong>${escapeHtml(a.name)}</strong>
            <div class="item-meta">${escapeHtml(a.phone || "")}${a.syncToken ? " · đã có mã sync" : ""} ${extLabel}</div></div>
            <div class="crm-inline-btns">
              <button type="button" class="secondary mini" data-gen-sync="${a.id}" ${getRole() !== "admin" ? "disabled" : ""}>Mã sync</button>
              <button type="button" class="secondary mini" data-del-account="${a.id}" ${getRole() !== "admin" ? "disabled" : ""}>Xóa</button>
            </div>
          </li>`;
        })
        .join("") || `<li class="item-meta">Chưa có tài khoản Zalo — thêm bên dưới.</li>`;
    }
    if (els.activeAccount) {
      const opts = (state.zaloAccounts || [])
        .map((a) => `<option value="${a.id}" ${state.crmSettings?.activeZaloAccountId === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`)
        .join("");
      els.activeAccount.innerHTML = `<option value="">— Chưa chọn —</option>${opts}`;
    }
  }

  function renderTags() {
    const state = getState();
    if (!els.tagsList) return;
    const segs = (state.segments || [])
      .map((s) => `<span class="crm-chip" style="border-color:${s.color}">${escapeHtml(s.name)}</span>`)
      .join("");
    const tags = (state.tagCatalog || [])
      .map(
        (t) => `<span class="crm-chip tag" style="border-color:${t.color}">${escapeHtml(t.name)}
        <button type="button" class="crm-chip-x" data-del-tag="${t.id}" title="Xóa">×</button></span>`,
      )
      .join("");
    els.tagsList.innerHTML = `${segs}${tags}` || '<span class="item-meta">Chưa có thẻ.</span>';
  }

  function renderTemplates() {
    const state = getState();
    if (!els.templatesList) return;
    els.templatesList.innerHTML = (state.messageTemplates || [])
      .map(
        (t) => `<li class="list-item">
          <div><strong>${escapeHtml(t.title)}</strong><div class="item-meta">${escapeHtml((t.body || "").slice(0, 80))}...</div></div>
          <div>
            <button type="button" class="secondary mini" data-use-template="${t.id}">Dùng</button>
            <button type="button" class="secondary mini" data-del-template="${t.id}">Xóa</button>
          </div>
        </li>`,
      )
      .join("") || `<li class="item-meta">Chưa có mẫu tin.</li>`;

    if (els.quickList) {
      els.quickList.innerHTML = (state.quickReplies || [])
        .map(
          (q) => `<li class="list-item">
            <div><strong>/${escapeHtml(q.shortcut)}</strong><div class="item-meta">${escapeHtml(q.body)}</div></div>
            <button type="button" class="secondary mini" data-del-quick="${q.id}">Xóa</button>
          </li>`,
        )
        .join("") || `<li class="item-meta">Chưa có trả lời nhanh.</li>`;
    }
  }

  function renderCare() {
    if (!els.careList) return;
    const rows = groupsForCare().slice(0, 30);
    els.careList.innerHTML =
      rows
        .map(({ group, inactive, dueFollowUp }) => {
          const flags = [dueFollowUp ? "Đến lịch follow-up" : null, inactive ? "Lâu không tương tác" : null]
            .filter(Boolean)
            .join(" · ");
          return `<li class="list-item">
            <div><strong>${escapeHtml(group.name)}</strong>
            <div class="item-meta">${escapeHtml(flags)} · ${escapeHtml(segmentName(group.segment))}</div></div>
            <button type="button" class="secondary mini" data-open-profile="${group.id}">Hồ sơ</button>
          </li>`;
        })
        .join("") || `<li class="item-meta">Không có nhắc chăm sóc — tốt!</li>`;
  }

  function renderSettings() {
    const s = getState().crmSettings || {};
    if (els.webhookUrl) els.webhookUrl.value = s.webhookUrl || "";
    if (els.inactiveDays) els.inactiveDays.value = s.inactiveDays || 14;
  }

  function renderSegmentFilter() {
    if (!els.segmentFilter) return;
    const state = getState();
    const opts = (state.segments || [])
      .map((s) => `<option value="${s.id}" ${groupSegmentFilter === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`)
      .join("");
    els.segmentFilter.innerHTML = `<option value="all">Tất cả phân loại</option>${opts}`;
  }

  function renderAllCrm() {
    renderAccounts();
    renderTags();
    renderTemplates();
    renderCare();
    renderSettings();
    renderSegmentFilter();
  }

  function openProfile(groupId) {
    const g = getState().groups.find((x) => x.id === groupId);
    if (!g || !els.profileModal) return;
    els.profileGroupId.value = g.id;
    els.profilePhone.value = g.phone || "";
    els.profileNote.value = g.customerNote || "";
    const state = getState();
    els.profileSegment.innerHTML = (state.segments || [])
      .map((s) => `<option value="${s.id}" ${g.segment === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`)
      .join("");
    const tagIds = new Set(g.tags || []);
    els.profileTags.innerHTML = (state.tagCatalog || [])
      .map(
        (t) => `<label class="crm-tag-check"><input type="checkbox" value="${t.id}" ${tagIds.has(t.id) ? "checked" : ""} /> ${escapeHtml(t.name)}</label>`,
      )
      .join("");
    els.profileInteractions.innerHTML = (g.interactions || [])
      .slice(0, 10)
      .map((ix) => `<li class="item-meta">${new Date(ix.at).toLocaleString()} — ${escapeHtml(ix.summary)}</li>`)
      .join("") || `<li class="item-meta">Chưa có lịch sử ghi nhận.</li>`;
    els.profileModal.classList.remove("hidden");
  }

  function closeProfile() {
    els.profileModal?.classList.add("hidden");
  }

  els.accountForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (getRole() !== "admin") return;
    const name = els.accountName?.value.trim();
    if (!name) return;
    const state = getState();
    const snap = typeof getPlanSnapshot === "function" ? getPlanSnapshot() : null;
    const maxAccounts = snap?.plan?.maxZaloAccounts ?? 1;
    if ((state.zaloAccounts || []).length >= maxAccounts) {
      if (typeof notifyPlanBlocked === "function") notifyPlanBlocked("multiZalo");
      else alert(`Gói hiện tại tối đa ${maxAccounts} tài khoản Zalo Web.`);
      return;
    }
    state.zaloAccounts.push({
      id: uid("za"),
      name,
      phone: els.accountPhone?.value.trim() || "",
      syncToken: "",
      createdAt: Date.now(),
    });
    setState(state);
    saveState();
    els.accountName.value = "";
    els.accountPhone.value = "";
    renderAllCrm();
    renderAll();
  });

  els.tagForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = els.tagName?.value.trim();
    if (!name) return;
    const state = getState();
    state.tagCatalog.push({ id: uid("tag"), name, color: "#6366f1" });
    setState(state);
    saveState();
    els.tagName.value = "";
    renderAllCrm();
  });

  els.templateForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = els.templateTitle?.value.trim();
    const body = els.templateBody?.value.trim();
    if (!title || !body) return;
    const state = getState();
    state.messageTemplates.unshift({ id: uid("tpl"), title, body, createdAt: Date.now() });
    setState(state);
    saveState();
    els.templateTitle.value = "";
    els.templateBody.value = "";
    renderAllCrm();
  });

  els.quickForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const shortcut = els.quickShortcut?.value.trim().replace(/^\//, "");
    const body = els.quickBody?.value.trim();
    if (!shortcut || !body) return;
    const state = getState();
    state.quickReplies.unshift({ id: uid("qr"), shortcut, body });
    setState(state);
    saveState();
    els.quickShortcut.value = "";
    els.quickBody.value = "";
    renderAllCrm();
  });

  els.activeAccount?.addEventListener("change", () => {
    const state = getState();
    state.crmSettings.activeZaloAccountId = els.activeAccount.value || null;
    setState(state);
    saveState();
  });

  panel.addEventListener("click", (e) => {
    const state = getState();
    const delAcc = e.target.closest("[data-del-account]");
    if (delAcc && getRole() === "admin") {
      const id = delAcc.getAttribute("data-del-account");
      state.zaloAccounts = state.zaloAccounts.filter((a) => a.id !== id);
      setState(state);
      saveState();
      renderAllCrm();
      return;
    }
    const delTag = e.target.closest("[data-del-tag]");
    if (delTag) {
      const id = delTag.getAttribute("data-del-tag");
      state.tagCatalog = state.tagCatalog.filter((t) => t.id !== id);
      setState(state);
      saveState();
      renderAllCrm();
      return;
    }
    const delTpl = e.target.closest("[data-del-template]");
    if (delTpl) {
      const id = delTpl.getAttribute("data-del-template");
      state.messageTemplates = state.messageTemplates.filter((t) => t.id !== id);
      setState(state);
      saveState();
      renderAllCrm();
      return;
    }
    const useTpl = e.target.closest("[data-use-template]");
    if (useTpl) {
      const t = state.messageTemplates.find((x) => x.id === useTpl.getAttribute("data-use-template"));
      if (t && onApplyTemplate) onApplyTemplate(t.body);
      return;
    }
    const delQuick = e.target.closest("[data-del-quick]");
    if (delQuick) {
      const id = delQuick.getAttribute("data-del-quick");
      state.quickReplies = state.quickReplies.filter((q) => q.id !== id);
      setState(state);
      saveState();
      renderAllCrm();
      return;
    }
    const openProf = e.target.closest("[data-open-profile]");
    if (openProf) openProfile(openProf.getAttribute("data-open-profile"));
    const genSync = e.target.closest("[data-gen-sync]");
    if (genSync && getRole() === "admin") {
      const id = genSync.getAttribute("data-gen-sync");
      apiFetch(`/api/crm/accounts/${id}/sync-token`, { method: "POST" })
        .then((res) => res.json())
        .then((data) => {
          if (!data.ok) {
            alert(data.error || "Không tạo được mã sync.");
            return;
          }
          setState(data.state);
          renderAllCrm();
          renderAll();
          const text = `CRM: ${data.crmBaseUrl}\nMã sync (${data.accountId}): ${data.syncToken}`;
          navigator.clipboard?.writeText(text).then(() => {
            alert("Đã tạo mã sync — dán vào extension popup của tài khoản Zalo này.");
          });
        })
        .catch(() => alert("Không tạo được mã sync."));
    }
  });

  els.profileForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = els.profileGroupId?.value;
    const state = getState();
    const g = state.groups.find((x) => x.id === id);
    if (!g) return;
    g.phone = els.profilePhone?.value.trim() || "";
    g.customerNote = els.profileNote?.value.trim() || "";
    g.segment = els.profileSegment?.value || "lead";
    g.tags = [...els.profileTags.querySelectorAll("input:checked")].map((el) => el.value);
    setState(state);
    saveState();
    closeProfile();
    renderAll();
    renderAllCrm();
  });

  els.profileClose?.addEventListener("click", closeProfile);

  async function addProfileInteraction() {
    const id = els.profileGroupId?.value;
    const summary = els.profileNewInteraction?.value.trim();
    if (!id || !summary) return;
    try {
      const res = await apiFetch("/api/crm/interaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: id, summary, type: "note" }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || "Không ghi nhận được.");
        return;
      }
      setState(data.state);
      els.profileNewInteraction.value = "";
      openProfile(id);
      renderAll();
      renderAllCrm();
    } catch {
      alert("Không ghi nhận được tương tác.");
    }
  }

  els.profileAddInteraction?.addEventListener("click", addProfileInteraction);
  els.profileNewInteraction?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addProfileInteraction();
    }
  });

  els.webhookUrl?.addEventListener("change", () => {
    const state = getState();
    state.crmSettings.webhookUrl = els.webhookUrl.value.trim();
    setState(state);
    saveState();
  });

  els.inactiveDays?.addEventListener("change", () => {
    const state = getState();
    state.crmSettings.inactiveDays = Number(els.inactiveDays.value) || 14;
    setState(state);
    saveState();
    renderCare();
  });

  els.webhookTest?.addEventListener("click", async () => {
    try {
      const res = await apiFetch("/api/crm/webhook-test", { method: "POST" });
      const data = await res.json();
      alert(data.ok ? "Webhook OK!" : `Webhook lỗi: ${data.error || data.status || "?"}`);
    } catch {
      alert("Không test được webhook.");
    }
  });

  els.exportBtn?.addEventListener("click", async () => {
    try {
      const res = await apiFetch("/api/export/crm");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zalo-crm-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Không export được — đăng nhập admin và kiểm tra server.");
    }
  });

  els.segmentFilter?.addEventListener("change", () => {
    groupSegmentFilter = els.segmentFilter.value;
    renderAll();
  });

  document.getElementById("toggle-crm-full")?.addEventListener("click", () => {
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) renderAllCrm();
  });

  return {
    render: renderAllCrm,
    getSegmentFilter: () => groupSegmentFilter,
    openProfile,
    logInteraction(groupId, summary, type = "event") {
      const state = getState();
      const idx = state.groups.findIndex((g) => g.id === groupId);
      if (idx < 0) return;
      const g = state.groups[idx];
      const row = {
        id: uid("ix"),
        at: new Date().toISOString(),
        type,
        summary: String(summary).slice(0, 500),
        by: getRole(),
      };
      g.interactions = [row, ...(g.interactions || [])].slice(0, 50);
      g.lastInteractionAt = row.at;
      state.groups[idx] = g;
      setState(state);
    },
  };
}

window.initCrmFullUi = initCrmFullUi;
