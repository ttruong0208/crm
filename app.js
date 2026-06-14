const STORAGE_KEY = "zalo_campaign_crm_mvp_v1";

const taskView = {
  page: 1,
  pageSize: 25,
};

const initialState = {
  groups: [],
  campaigns: [],
  tasksByCampaign: {},
  activeCampaignId: null,
  broadcasts: [],
  activeBroadcastId: null,
  zaloAccounts: [],
  tagCatalog: [],
  segments: [],
  messageTemplates: [],
  quickReplies: [],
  crmSettings: { webhookUrl: "", inactiveDays: 14, activeZaloAccountId: null, subscriptionPlan: "basic" },
  role: "admin",
};

const broadcastView = {
  statusFilter: "all",
  search: "",
  selectedGroupIds: new Set(),
  page: 1,
  pageSize: 50,
};

const broadcastCreateAttachments = [];

let state = structuredClone(initialState);
let currentUser = null;
let groupImportWizard = null;
let crmFullUi = null;
let crmInboxUi = null;
let focusedMessageTaskId = null;
let syncPollTimer = null;
let groupListTypeFilter = "group";
let groupListSearch = "";
let switchAppView = () => {};
let pendingDedupImport = null;

const refs = {
  role: document.getElementById("role"),
  authInfo: document.getElementById("auth-info"),
  roleWrap: document.getElementById("role-wrap"),
  logoutBtn: document.getElementById("logout-btn"),
  groupForm: document.getElementById("group-form"),
  groupName: document.getElementById("group-name"),
  groupOwner: document.getElementById("group-owner"),
  groupSearch: document.getElementById("group-search"),
  groupSearchHint: document.getElementById("group-search-hint"),
  groupList: document.getElementById("group-list"),
  groupCount: document.getElementById("group-count"),
  toggleBulkImport: document.getElementById("toggle-bulk-import"),
  bulkImportPanel: document.getElementById("bulk-import-panel"),
  campaignForm: document.getElementById("campaign-form"),
  campaignName: document.getElementById("campaign-name"),
  campaignNote: document.getElementById("campaign-note"),
  campaignList: document.getElementById("campaign-list"),
  activeCampaign: document.getElementById("active-campaign"),
  activeCampaignDashboard: document.getElementById("active-campaign-dashboard"),
  appNav: document.getElementById("app-nav"),
  statusFilter: document.getElementById("status-filter"),
  priorityFilter: document.getElementById("priority-filter"),
  followupFilter: document.getElementById("followup-filter"),
  taskSearch: document.getElementById("task-search"),
  taskSearchHint: document.getElementById("task-search-hint"),
  assigneeFilter: document.getElementById("assignee-filter"),
  assigneeCustomWrap: document.getElementById("assignee-custom-wrap"),
  assigneeCustom: document.getElementById("assignee-custom"),
  scoreMin: document.getElementById("score-min"),
  scoreMax: document.getElementById("score-max"),
  sortBy: document.getElementById("sort-by"),
  filterHasAttachment: document.getElementById("filter-has-attachment"),
  filterUnassigned: document.getElementById("filter-unassigned"),
  clearFilters: document.getElementById("clear-filters"),
  filterSummary: document.getElementById("filter-summary"),
  paginationBar: document.getElementById("pagination-bar"),
  paginationInfo: document.getElementById("pagination-info"),
  pageSize: document.getElementById("page-size"),
  pagePrev: document.getElementById("page-prev"),
  pageNext: document.getElementById("page-next"),
  pageIndicator: document.getElementById("page-indicator"),
  exportCsv: document.getElementById("export-csv"),
  focusOverdue: document.getElementById("focus-overdue"),
  bulkAssignee: document.getElementById("bulk-assignee"),
  applyBulkAssignee: document.getElementById("apply-bulk-assignee"),
  bulkMarkSent: document.getElementById("bulk-mark-sent"),
  bulkMarkDone: document.getElementById("bulk-mark-done"),
  zaloSyncStatus: document.getElementById("zalo-sync-status"),
  zaloSyncSetup: document.getElementById("zalo-sync-setup"),
  zaloSyncCopy: document.getElementById("zalo-sync-copy"),
  zaloSyncRefresh: document.getElementById("zalo-sync-refresh"),
  zaloSyncToken: document.getElementById("zalo-sync-token"),
  extensionHealthList: document.getElementById("extension-health-list"),
  assigneeAnalytics: document.getElementById("assignee-analytics"),
  dedupModal: document.getElementById("dedup-merge-modal"),
  dedupList: document.getElementById("dedup-merge-list"),
  summaryCards: document.getElementById("summary-cards"),
  taskTableWrap: document.getElementById("task-table-wrap"),
  toggleBroadcastCreate: document.getElementById("toggle-broadcast-create"),
  broadcastCreatePanel: document.getElementById("broadcast-create-panel"),
  broadcastForm: document.getElementById("broadcast-form"),
  broadcastTitle: document.getElementById("broadcast-title"),
  broadcastMessage: document.getElementById("broadcast-message"),
  broadcastGroupSearch: document.getElementById("broadcast-group-search"),
  broadcastSelectAll: document.getElementById("broadcast-select-all"),
  broadcastSelectNone: document.getElementById("broadcast-select-none"),
  broadcastPickerCount: document.getElementById("broadcast-picker-count"),
  broadcastGroupPicker: document.getElementById("broadcast-group-picker"),
  broadcastCancelCreate: document.getElementById("broadcast-cancel-create"),
  activeBroadcast: document.getElementById("active-broadcast"),
  broadcastWorkspace: document.getElementById("broadcast-workspace"),
  broadcastPaginationBar: document.getElementById("broadcast-pagination-bar"),
  broadcastPaginationInfo: document.getElementById("broadcast-pagination-info"),
  broadcastPageSize: document.getElementById("broadcast-page-size"),
  broadcastPagePrev: document.getElementById("broadcast-page-prev"),
  broadcastPageNext: document.getElementById("broadcast-page-next"),
  broadcastPageIndicator: document.getElementById("broadcast-page-indicator"),
  broadcastFileInput: document.getElementById("broadcast-file-input"),
  broadcastAttachmentsList: document.getElementById("broadcast-attachments-list"),
  broadcastSendSelected: document.getElementById("broadcast-send-selected"),
};

initApp();

async function initApp() {
  migrateLegacyToken();
  bindEvents();
  scheduleTokenRefreshFromStoredExpiry();
  const me = await fetchMe();
  if (!me) {
    window.location.href = "/login.html";
    return;
  }
  currentUser = me;
  window.currentUserRole = me.role;
  state = await loadState();
  window.__crmStateRef = state;
  state.role = currentUser.role;
  await loadPlanSnapshot();
  if (typeof normalizeCrmStateBrowser === "function") {
    state = normalizeCrmStateBrowser(state);
  }
  normalizeBroadcastsInState();
  normalizeTasksInState();
  setAuthUi();
  crmFullUi = initCrmFullUi({
    getState: () => state,
    setState: (next) => {
      state = next;
      window.__crmStateRef = state;
    },
    saveState,
    renderAll,
    escapeHtml,
    getRole: () => currentUser?.role,
    onApplyTemplate(body) {
      insertIntoFocusedMessage(body);
    },
  });
  crmInboxUi = initCrmInboxUi({
    getState: () => state,
    escapeHtml,
    onOpenProfile: (id) => crmFullUi?.openProfile(id),
  });
  bindTaskTemplateBar();
  renderAll();
  groupImportWizard = initGroupImportWizard({
    panel: refs.bulkImportPanel,
    toggleBtn: refs.toggleBulkImport,
    getRole: () => currentUser?.role,
    onImport: importGroupsToCrm,
  });
  bindZaloSyncUi();
  bindDedupModal();
  initAppNav();
  window.onPlanChanged = async () => {
    await loadPlanSnapshot();
    if (planSnapshot?.plan?.id) {
      state.crmSettings = state.crmSettings || {};
      state.crmSettings.subscriptionPlan = planSnapshot.plan.id;
      window.__crmStateRef = state;
      saveState();
    }
    applyPlanUi();
    renderAll();
  };
  applyPlanUi();
  await initTeamUsersPanel();
  document.getElementById("admin-open-users")?.addEventListener("click", () => {
    switchAppView("users");
    refreshTeamUsersPanel();
  });
  startSyncPolling();
  refreshExtensionHealth();
  syncCampaignToExtension();
  syncTokenToExtension();
}

async function loadState() {
  try {
    const response = await apiFetch("/api/state");
    if (response.status === 401) return structuredClone(initialState);
    if (response.ok) {
      const payload = await response.json();
      if (payload?.state) {
        const merged = {
          ...structuredClone(initialState),
          ...payload.state,
        };
        if (!Array.isArray(merged.broadcasts)) merged.broadcasts = [];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        if (payload.plan) {
          planSnapshot = payload.plan;
        }
        return merged;
      }
    }
  } catch {
    // Fallback to local state below when backend is unavailable.
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed) return structuredClone(initialState);
    return {
      ...structuredClone(initialState),
      ...parsed,
    };
  } catch {
    return structuredClone(initialState);
  }
}

let saveDebounceTimer = null;
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(syncStateToServer, 250);
}

async function syncStateToServer() {
  if (!getAccessToken()) return;
  try {
    const response = await apiFetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
    if (response.status === 401) {
      redirectToLogin("expired");
      return;
    }
    if (response.status === 403) {
      const payload = await response.json().catch(() => ({}));
      alert(payload.error || "Vượt giới hạn gói dịch vụ. Xem Cài đặt → Gói dịch vụ.");
      await loadPlanSnapshot();
      applyPlanUi();
      renderAll();
    }
  } catch {
    // Keep local mode working if backend is temporarily unreachable.
  }
}

function bindEvents() {
  refs.role.addEventListener("change", () => {
    refs.role.value = currentUser?.role || "admin";
  });
  refs.logoutBtn.addEventListener("click", handleLogout);

  refs.toggleBulkImport?.addEventListener("click", () => {
    refs.bulkImportPanel?.classList.toggle("hidden");
  });

  document.querySelectorAll("[data-group-type-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      groupListTypeFilter = btn.getAttribute("data-group-type-filter") || "group";
      document.querySelectorAll("[data-group-type-filter]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderGroups();
    });
  });

  refs.groupSearch?.addEventListener(
    "input",
    debounce((e) => {
      groupListSearch = e.target.value.trim();
      renderGroups();
    }, 150),
  );

  refs.groupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = refs.groupName.value.trim();
    if (!name) return;
    if (typeof canAddGroups === "function" && !canAddGroups(1)) {
      notifyPlanBlocked("groups");
      return;
    }
    state.groups.push({
      id: uid(),
      name,
      owner: refs.groupOwner.value.trim(),
      zaloGroupId: "",
      chatType: "group",
      createdAt: Date.now(),
    });
    refs.groupForm.reset();
    syncTasksWithGroups();
    saveState();
    renderAll();
  });

  refs.campaignForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = refs.campaignName.value.trim();
    if (!name) return;
    const campaignId = uid();
    state.campaigns.push({
      id: campaignId,
      name,
      note: refs.campaignNote.value.trim(),
      createdAt: Date.now(),
    });
    state.tasksByCampaign[campaignId] = campaignEligibleGroups().map((group) => newTask(group.id));
    state.activeCampaignId = campaignId;
    refs.campaignForm.reset();
    saveState();
    renderAll();
  });

  refs.activeCampaign.addEventListener("change", (e) => {
    setActiveCampaignId(e.target.value || null);
  });
  refs.activeCampaignDashboard?.addEventListener("change", (e) => {
    setActiveCampaignId(e.target.value || null);
  });

  const onFilterChange = () => {
    resetTaskPage();
    renderTasks();
  };

  refs.statusFilter.addEventListener("change", onFilterChange);
  refs.priorityFilter.addEventListener("change", onFilterChange);
  refs.followupFilter.addEventListener("change", onFilterChange);
  refs.taskSearch.addEventListener("input", debounce(onFilterChange, 200));
  refs.assigneeFilter.addEventListener("change", () => {
    refs.assigneeCustomWrap.classList.toggle("hidden", refs.assigneeFilter.value !== "custom");
    onFilterChange();
  });
  refs.assigneeCustom.addEventListener("input", debounce(onFilterChange, 200));
  refs.scoreMin.addEventListener("change", onFilterChange);
  refs.scoreMax.addEventListener("change", onFilterChange);
  refs.sortBy.addEventListener("change", onFilterChange);
  refs.filterHasAttachment.addEventListener("change", onFilterChange);
  refs.filterUnassigned.addEventListener("change", onFilterChange);
  refs.clearFilters.addEventListener("click", clearTaskFilters);
  refs.pageSize.addEventListener("change", () => {
    taskView.pageSize = Number(refs.pageSize.value) || 25;
    resetTaskPage();
    renderTasks();
  });
  refs.pagePrev.addEventListener("click", () => {
    if (taskView.page > 1) {
      taskView.page -= 1;
      renderTasks();
    }
  });
  refs.pageNext.addEventListener("click", () => {
    taskView.page += 1;
    renderTasks();
  });
  refs.exportCsv.addEventListener("click", exportActiveCampaignCsv);
  refs.focusOverdue.addEventListener("click", () => {
    refs.followupFilter.value = "overdue";
    onFilterChange();
  });
  refs.applyBulkAssignee.addEventListener("click", applyBulkAssignee);
  refs.bulkMarkSent.addEventListener("click", () => bulkUpdateStatus("sent"));
  refs.bulkMarkDone.addEventListener("click", () => bulkUpdateStatus("done"));

  refs.zaloSyncSetup?.addEventListener("click", setupZaloSync);
  refs.zaloSyncCopy?.addEventListener("click", copyZaloSyncToken);
  refs.zaloSyncRefresh?.addEventListener("click", refreshStateFromServer);

  bindBroadcastEvents();
}

function bindBroadcastEvents() {
  refs.toggleBroadcastCreate?.addEventListener("click", () => {
    if (typeof planHasFeature === "function" && !planHasFeature("broadcast")) {
      notifyPlanBlocked("broadcast");
      return;
    }
    refs.broadcastCreatePanel?.classList.toggle("hidden");
    if (!refs.broadcastCreatePanel?.classList.contains("hidden")) {
      renderBroadcastGroupPicker();
      renderBroadcastCreateAttachments();
    }
  });
  refs.broadcastCancelCreate?.addEventListener("click", () => {
    refs.broadcastCreatePanel?.classList.add("hidden");
    refs.broadcastForm?.reset();
    broadcastCreateSelection.clear();
    broadcastCreateAttachments.length = 0;
    renderBroadcastCreateAttachments();
    renderBroadcastGroupPicker();
  });
  refs.broadcastFileInput?.addEventListener("change", async (e) => {
    if (typeof planHasFeature === "function" && !planHasFeature("attachments")) {
      notifyPlanBlocked("attachments");
      e.target.value = "";
      return;
    }
    const files = [...(e.target.files || [])];
    e.target.value = "";
    for (const file of files) {
      try {
        const att = await uploadAttachmentFile(file);
        broadcastCreateAttachments.push(att);
      } catch (err) {
        alert(err.message || "Upload thất bại");
      }
    }
    renderBroadcastCreateAttachments();
  });
  refs.broadcastPageSize?.addEventListener("change", () => {
    broadcastView.pageSize = Number(refs.broadcastPageSize.value) || 50;
    broadcastView.page = 1;
    renderBroadcastWorkspace();
  });
  refs.broadcastPagePrev?.addEventListener("click", () => {
    if (broadcastView.page > 1) {
      broadcastView.page -= 1;
      renderBroadcastWorkspace();
    }
  });
  refs.broadcastPageNext?.addEventListener("click", () => {
    broadcastView.page += 1;
    renderBroadcastWorkspace();
  });
  refs.broadcastSendSelected?.addEventListener("click", () => {
    const broadcast = state.broadcasts.find((b) => b.id === state.activeBroadcastId);
    if (broadcast) sendBroadcastBatch(broadcast.id);
  });
  refs.broadcastGroupSearch?.addEventListener("input", debounce(() => renderBroadcastGroupPicker(), 150));
  refs.broadcastSelectAll?.addEventListener("click", () => {
    getFilteredGroupsForPicker(refs.broadcastGroupSearch?.value || "").forEach((g) => broadcastCreateSelection.add(g.id));
    renderBroadcastGroupPicker();
  });
  refs.broadcastSelectNone?.addEventListener("click", () => {
    broadcastCreateSelection.clear();
    renderBroadcastGroupPicker();
  });
  refs.broadcastForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    createBroadcast();
  });
  refs.activeBroadcast?.addEventListener("change", (e) => {
    state.activeBroadcastId = e.target.value || null;
    broadcastView.selectedGroupIds.clear();
    saveState();
    renderBroadcastWorkspace();
  });
}

const broadcastCreateSelection = new Set();

function syncTasksWithGroups() {
  const eligible = campaignEligibleGroups();
  const allGroupIds = new Set(state.groups.map((g) => g.id));
  const campaignGroupIds = new Set(eligible.map((g) => g.id));

  for (const campaignId of Object.keys(state.tasksByCampaign)) {
    const tasks = state.tasksByCampaign[campaignId] || [];
    const tasksByGroup = Object.fromEntries(tasks.map((t) => [t.groupId, t]));
    state.tasksByCampaign[campaignId] = eligible.map((group) => tasksByGroup[group.id] || newTask(group.id));
    state.tasksByCampaign[campaignId] = state.tasksByCampaign[campaignId].filter((t) => campaignGroupIds.has(t.groupId));
  }

  syncBroadcastsWithGroups(allGroupIds);
}

function syncBroadcastsWithGroups(allGroupIds) {
  if (!Array.isArray(state.broadcasts)) state.broadcasts = [];
  state.broadcasts.forEach((broadcast) => {
    const recipients = broadcast.recipients || {};
    Object.keys(recipients).forEach((groupId) => {
      if (!allGroupIds.has(groupId)) delete recipients[groupId];
    });
    broadcast.recipients = recipients;
  });
  if (state.activeBroadcastId && !state.broadcasts.some((b) => b.id === state.activeBroadcastId)) {
    state.activeBroadcastId = state.broadcasts[0]?.id || null;
  }
}

function normalizeBroadcastsInState() {
  if (!Array.isArray(state.broadcasts)) state.broadcasts = [];
  state.broadcasts = state.broadcasts.map((b) => normalizeBroadcast(b)).filter(Boolean);
  syncBroadcastsWithGroups(new Set(state.groups.map((g) => g.id)));
}

function normalizeBroadcast(raw) {
  if (!raw?.id) return null;
  const recipients = raw.recipients && typeof raw.recipients === "object" ? raw.recipients : {};
  const normalizedRecipients = {};
  Object.entries(recipients).forEach(([groupId, rec]) => {
    normalizedRecipients[groupId] = {
      status: rec?.status === "sent" ? "sent" : "pending",
      sentAt: rec?.sentAt || null,
    };
  });
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments
        .filter((a) => a?.id && a?.name)
        .map((a) => ({
          id: a.id,
          name: String(a.name),
          mime: String(a.mime || ""),
          size: Number(a.size || 0),
          url: a.url || `/api/attachments/${a.id}`,
          uploadedAt: a.uploadedAt || null,
        }))
    : [];
  return {
    id: raw.id,
    title: String(raw.title || "Thong bao"),
    message: String(raw.message || ""),
    createdAt: Number(raw.createdAt) || Date.now(),
    recipients: normalizedRecipients,
    attachments,
  };
}

function newBroadcastRecipients(groupIds) {
  const recipients = {};
  groupIds.forEach((groupId) => {
    recipients[groupId] = { status: "pending", sentAt: null };
  });
  return recipients;
}

function getBroadcastStats(broadcast) {
  const entries = Object.values(broadcast.recipients || {});
  const total = entries.length;
  const sent = entries.filter((r) => r.status === "sent").length;
  return { total, sent, pending: total - sent };
}

function createBroadcast() {
  if (state.role === "responder") {
    alert("Vai tro nguoi tra loi khong tao thong bao moi.");
    return;
  }
  if (typeof planHasFeature === "function" && !planHasFeature("broadcast")) {
    notifyPlanBlocked("broadcast");
    return;
  }
  const title = refs.broadcastTitle?.value.trim();
  const message = refs.broadcastMessage?.value.trim();
  if (!title || !message) return;
  const groupIds = [...broadcastCreateSelection];
  if (!groupIds.length) {
    alert("Chon it nhat mot nhom.");
    return;
  }
  const broadcast = {
    id: uid(),
    title,
    message,
    createdAt: Date.now(),
    recipients: newBroadcastRecipients(groupIds),
    attachments: broadcastCreateAttachments.map((a) => ({ ...a })),
  };
  state.broadcasts.unshift(broadcast);
  state.activeBroadcastId = broadcast.id;
  broadcastCreateSelection.clear();
  broadcastCreateAttachments.length = 0;
  renderBroadcastCreateAttachments();
  refs.broadcastForm?.reset();
  refs.broadcastCreatePanel?.classList.add("hidden");
  saveState();
  renderBroadcasts();
}

function renderBroadcastGroupPicker() {
  if (!refs.broadcastGroupPicker) return;
  const filtered = getFilteredGroupsForPicker(refs.broadcastGroupSearch?.value || "");
  if (refs.broadcastPickerCount) {
    refs.broadcastPickerCount.textContent = `Da chon ${broadcastCreateSelection.size} / ${state.groups.length} nhóm`;
  }
  if (!filtered.length) {
    refs.broadcastGroupPicker.innerHTML = `<p class="item-meta">Khong co nhom nao. Them nhom o cot ben trai truoc.</p>`;
    return;
  }
  refs.broadcastGroupPicker.innerHTML = filtered
    .map((group) => {
      const checked = broadcastCreateSelection.has(group.id) ? "checked" : "";
      return `
        <label class="broadcast-group-option">
          <input type="checkbox" data-broadcast-pick="${group.id}" ${checked} />
          <span>
            <strong>${escapeHtml(group.name)}</strong>
            <span class="item-meta">${escapeHtml(group.owner || "Chua gan owner")}</span>
          </span>
        </label>
      `;
    })
    .join("");
  refs.broadcastGroupPicker.querySelectorAll("[data-broadcast-pick]").forEach((input) => {
    input.addEventListener("change", () => {
      const groupId = input.getAttribute("data-broadcast-pick");
      if (input.checked) broadcastCreateSelection.add(groupId);
      else broadcastCreateSelection.delete(groupId);
      if (refs.broadcastPickerCount) {
        refs.broadcastPickerCount.textContent = `Da chon ${broadcastCreateSelection.size} / ${state.groups.length} nhóm`;
      }
    });
  });
}

function getFilteredGroupsForPicker(query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  return state.groups
    .filter((group) => groupChatType(group) !== "user")
    .filter((group) => {
      if (!q) return true;
      const hay = `${group.name} ${group.owner || ""} ${group.zaloGroupId || ""}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

function renderBroadcasts() {
  renderBroadcastSelector();
  renderBroadcastWorkspace();
  if (!refs.broadcastCreatePanel?.classList.contains("hidden")) {
    renderBroadcastGroupPicker();
    renderBroadcastCreateAttachments();
  }
}

function renderBroadcastSelector() {
  if (!refs.activeBroadcast) return;
  refs.activeBroadcast.innerHTML = `<option value="">-- Chon thong bao --</option>`;
  state.broadcasts
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((broadcast) => {
      const stats = getBroadcastStats(broadcast);
      const opt = document.createElement("option");
      opt.value = broadcast.id;
      opt.textContent = `${broadcast.title} (${stats.sent}/${stats.total})`;
      refs.activeBroadcast.appendChild(opt);
    });
  refs.activeBroadcast.value = state.activeBroadcastId || "";
}

function renderBroadcastWorkspace() {
  if (!refs.broadcastWorkspace) return;
  const broadcast = state.broadcasts.find((b) => b.id === state.activeBroadcastId);
  if (!broadcast) {
    const hint = state.broadcasts.length
      ? "Chon thong bao o menu «Dang xem»."
      : "Chua co thong bao nao — bam «Tao thong bao moi».";
    refs.broadcastWorkspace.innerHTML = `<p class="item-meta">${hint}</p>`;
    return;
  }

  const stats = getBroadcastStats(broadcast);
  const pct = stats.total ? Math.round((stats.sent / stats.total) * 100) : 0;
  const allRows = getBroadcastRows(broadcast);
  const total = allRows.length;
  const pageCount = Math.max(1, Math.ceil(total / broadcastView.pageSize));
  if (broadcastView.page > pageCount) broadcastView.page = pageCount;
  if (broadcastView.page < 1) broadcastView.page = 1;
  const start = (broadcastView.page - 1) * broadcastView.pageSize;
  const rows = allRows.slice(start, start + broadcastView.pageSize);
  const attHtml = broadcast.attachments?.length
    ? `<div class="broadcast-attachments-box"><label>File đính kèm (gửi tay trên Zalo)</label>${renderAttachmentChipsHtml(broadcast.attachments, { disabled: true })}</div>`
    : "";

  refs.broadcastWorkspace.innerHTML = `
    <div class="broadcast-summary">
      <div>
        <h3 class="broadcast-title">${escapeHtml(broadcast.title)}</h3>
        <p class="item-meta">Tao luc ${new Date(broadcast.createdAt).toLocaleString()} · ${stats.sent}/${stats.total} da gui</p>
      </div>
      <div class="broadcast-progress-wrap">
        <div class="broadcast-progress-bar" style="width:${pct}%"></div>
      </div>
    </div>
    <div class="broadcast-message-box">
      <label>Noi dung gui (giong nhau cho tat ca nhom)</label>
      <pre class="broadcast-message-pre">${escapeHtml(broadcast.message)}</pre>
      <div class="broadcast-actions-row">
        <button type="button" class="secondary" data-broadcast-action="copy-message">Copy nội dung</button>
        <button type="button" class="secondary" data-broadcast-action="export-csv">Export CSV</button>
        <button type="button" class="primary" data-broadcast-action="send-selected" ${state.role === "responder" ? "disabled" : ""}>📤 Gửi Web (đã chọn)</button>
        ${
          state.role === "admin" || state.role === "editor"
            ? `<button type="button" class="secondary" data-broadcast-action="delete">Xóa thông báo</button>`
            : ""
        }
      </div>
    </div>
    ${attHtml}
    <div class="broadcast-work-toolbar">
      <label>
        Trang thai
        <select data-broadcast-field="status-filter">
          <option value="all" ${broadcastView.statusFilter === "all" ? "selected" : ""}>Tat ca</option>
          <option value="pending" ${broadcastView.statusFilter === "pending" ? "selected" : ""}>Chua gui</option>
          <option value="sent" ${broadcastView.statusFilter === "sent" ? "selected" : ""}>Da gui</option>
        </select>
      </label>
      <label class="broadcast-search-label">
        Tim nhom
        <input type="search" data-broadcast-field="search" value="${escapeHtml(broadcastView.search)}" placeholder="Ten nhom..." />
      </label>
      <button type="button" data-broadcast-action="mark-sent">Đánh dấu đã gửi (đã chọn)</button>
    </div>
    <p class="item-meta broadcast-row-meta">Trang ${broadcastView.page}/${pageCount} · ${total} nhóm (lọc) · file đính kèm gửi tay trên Zalo</p>
    <div id="broadcast-pagination-inline" class="pagination-bar broadcast-pagination-bar">
      <span class="pagination-info">Dòng ${total ? start + 1 : 0}-${start + rows.length} / ${total}</span>
      <div class="pagination-controls">
        <button type="button" class="secondary mini" data-broadcast-page="prev" ${broadcastView.page <= 1 ? "disabled" : ""}>← Trước</button>
        <span class="page-indicator">Trang ${broadcastView.page}/${pageCount}</span>
        <button type="button" class="secondary mini" data-broadcast-page="next" ${broadcastView.page >= pageCount ? "disabled" : ""}>Sau →</button>
        <label class="page-size-label">
          / trang
          <select data-broadcast-field="page-size">
            <option value="25" ${broadcastView.pageSize === 25 ? "selected" : ""}>25</option>
            <option value="50" ${broadcastView.pageSize === 50 ? "selected" : ""}>50</option>
            <option value="100" ${broadcastView.pageSize === 100 ? "selected" : ""}>100</option>
          </select>
        </label>
      </div>
    </div>
    <div class="table-scroll broadcast-table-wrap">
      <table>
        <thead>
          <tr>
            <th><input type="checkbox" data-broadcast-action="toggle-page" title="Chọn trang" /></th>
            <th>Nhóm</th>
            <th>Phụ trách</th>
            <th>Trạng thái</th>
            <th>Lúc gửi</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(({ group, rec }) => {
              const sent = rec.status === "sent";
              const checked = broadcastView.selectedGroupIds.has(group.id) ? "checked" : "";
              return `
                <tr class="${sent ? "broadcast-row-sent" : ""}">
                  <td><input type="checkbox" data-broadcast-row="${group.id}" ${checked} /></td>
                  <td><strong>${escapeHtml(cleanDisplayGroupName(group.name))}</strong></td>
                  <td>${escapeHtml(group.owner || "—")}</td>
                  <td><span class="badge ${sent ? "sent" : "pending"}">${sent ? "Đã gửi" : "Chưa gửi"}</span></td>
                  <td class="item-meta">${rec.sentAt ? new Date(rec.sentAt).toLocaleString("vi-VN") : "—"}</td>
                  <td class="broadcast-row-actions">
                    ${zaloChatLinkHtml(group)}
                    <button type="button" class="primary mini" data-broadcast-send="${group.id}" ${sent || state.role === "responder" ? "disabled" : ""}>Gửi Web</button>
                    <button type="button" class="success mini" data-broadcast-mark="${group.id}" ${state.role === "responder" ? "disabled" : ""}>Đã gửi</button>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  bindBroadcastWorkspaceEvents(broadcast);
}

function getBroadcastRows(broadcast) {
  const q = broadcastView.search.trim().toLowerCase();
  const statusFilter = broadcastView.statusFilter;
  return Object.entries(broadcast.recipients || {})
    .map(([groupId, rec]) => {
      const group = state.groups.find((g) => g.id === groupId);
      if (!group) return null;
      if (statusFilter !== "all" && rec.status !== statusFilter) return null;
      if (q) {
        const hay = `${group.name} ${group.owner || ""}`.toLowerCase();
        if (!hay.includes(q)) return null;
      }
      return { group, rec };
    })
    .filter(Boolean)
    .sort((a, b) => a.group.name.localeCompare(b.group.name, "vi"));
}

function bindBroadcastWorkspaceEvents(broadcast) {
  const root = refs.broadcastWorkspace;
  if (!root) return;

  root.querySelector("[data-broadcast-field='status-filter']")?.addEventListener("change", (e) => {
    broadcastView.statusFilter = e.target.value;
    broadcastView.selectedGroupIds.clear();
    broadcastView.page = 1;
    renderBroadcastWorkspace();
  });
  root.querySelector("[data-broadcast-field='search']")?.addEventListener(
    "input",
    debounce((e) => {
      broadcastView.search = e.target.value;
      broadcastView.page = 1;
      renderBroadcastWorkspace();
    }, 150),
  );

  root.querySelector("[data-broadcast-action='copy-message']")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(broadcast.message);
      alert("Da copy noi dung thong bao.");
    } catch {
      alert("Khong copy duoc — chon va copy thu cong tu o noi dung.");
    }
  });

  root.querySelector("[data-broadcast-action='export-csv']")?.addEventListener("click", () => exportBroadcastCsv(broadcast));
  root.querySelector("[data-broadcast-action='delete']")?.addEventListener("click", () => {
    if (!confirm("Xoa thong bao nay?")) return;
    state.broadcasts = state.broadcasts.filter((b) => b.id !== broadcast.id);
    state.activeBroadcastId = state.broadcasts[0]?.id || null;
    broadcastView.selectedGroupIds.clear();
    saveState();
    renderBroadcasts();
  });

  root.querySelector("[data-broadcast-action='mark-sent']")?.addEventListener("click", () => {
    const ids = [...broadcastView.selectedGroupIds];
    if (!ids.length) {
      alert("Chon it nhat mot nhom trong bang.");
      return;
    }
    markBroadcastGroups(broadcast.id, ids, true);
  });

  root.querySelector("[data-broadcast-action='toggle-page']")?.addEventListener("change", (e) => {
    const rows = getBroadcastRows(broadcast);
    if (e.target.checked) rows.forEach(({ group }) => broadcastView.selectedGroupIds.add(group.id));
    else rows.forEach(({ group }) => broadcastView.selectedGroupIds.delete(group.id));
    renderBroadcastWorkspace();
  });

  root.querySelectorAll("[data-broadcast-row]").forEach((input) => {
    input.addEventListener("change", () => {
      const groupId = input.getAttribute("data-broadcast-row");
      if (input.checked) broadcastView.selectedGroupIds.add(groupId);
      else broadcastView.selectedGroupIds.delete(groupId);
    });
  });

  root.querySelector("[data-broadcast-action='send-selected']")?.addEventListener("click", () => {
    sendBroadcastBatch(broadcast.id);
  });

  root.querySelector("[data-broadcast-page='prev']")?.addEventListener("click", () => {
    if (broadcastView.page > 1) {
      broadcastView.page -= 1;
      renderBroadcastWorkspace();
    }
  });
  root.querySelector("[data-broadcast-page='next']")?.addEventListener("click", () => {
    broadcastView.page += 1;
    renderBroadcastWorkspace();
  });
  root.querySelector("[data-broadcast-field='page-size']")?.addEventListener("change", (e) => {
    broadcastView.pageSize = Number(e.target.value) || 50;
    broadcastView.page = 1;
    renderBroadcastWorkspace();
  });

  root.querySelectorAll("[data-broadcast-send]").forEach((btn) => {
    btn.addEventListener("click", () => {
      sendBroadcastToZalo(broadcast.id, btn.getAttribute("data-broadcast-send"));
    });
  });
  root.querySelectorAll("[data-broadcast-mark]").forEach((btn) => {
    btn.addEventListener("click", () => {
      markBroadcastGroups(broadcast.id, [btn.getAttribute("data-broadcast-mark")], true);
    });
  });

  root.querySelectorAll("[data-open-attachment]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open-attachment");
      const att = (broadcast.attachments || []).find((a) => a.id === id);
      if (att) openAttachment(att);
    });
  });
}

function markBroadcastGroups(broadcastId, groupIds, asSent) {
  const broadcast = state.broadcasts.find((b) => b.id === broadcastId);
  if (!broadcast) return;
  groupIds.forEach((groupId) => {
    const rec = broadcast.recipients[groupId];
    if (!rec) return;
    rec.status = asSent ? "sent" : "pending";
    rec.sentAt = asSent ? Date.now() : null;
  });
  broadcastView.selectedGroupIds.clear();
  saveState();
  renderBroadcasts();
}

function exportBroadcastCsv(broadcast) {
  const rows = getBroadcastRows(broadcast).map(({ group, rec }) => [
    group.name,
    group.owner || "",
    rec.status === "sent" ? "Da gui" : "Chua gui",
    rec.sentAt ? new Date(rec.sentAt).toLocaleString() : "",
    broadcast.message.replaceAll("\n", " "),
  ]);
  const header = ["Nhom", "Phu trach", "Trang thai", "Luc gui", "Noi dung thong bao"];
  const csv = [header, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(broadcast.title)}_broadcast.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeTaskAttachments(task) {
  if (!Array.isArray(task.attachments)) task.attachments = [];
  const legacy = String(task.attachment || "").trim();
  if (legacy && !task.attachments.some((a) => a.name === legacy)) {
    task.attachments.push({
      id: `legacy_${task.id}`,
      name: legacy,
      mime: "application/octet-stream",
      size: 0,
      legacy: true,
      url: "",
    });
  }
  return task;
}

function normalizeTasksInState() {
  for (const campaignId of Object.keys(state.tasksByCampaign || {})) {
    state.tasksByCampaign[campaignId] = (state.tasksByCampaign[campaignId] || []).map((t) =>
      normalizeTaskAttachments(t),
    );
  }
}

function taskHasAttachments(task) {
  normalizeTaskAttachments(task);
  return task.attachments.length > 0 || Boolean(String(task.attachment || "").trim());
}

function formatFileSize(bytes) {
  const n = Number(bytes || 0);
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function uploadAttachmentFile(file) {
  if (typeof planHasFeature === "function" && !planHasFeature("attachments")) {
    notifyPlanBlocked("attachments");
    throw new Error("Gói hiện tại chưa mở file đính kèm");
  }
  const data = await fileToBase64(file);
  const res = await apiFetch("/api/attachments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      mime: file.type || "application/octet-stream",
      data,
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 403 && payload.code?.startsWith("PLAN_")) {
      notifyPlanBlocked("attachments");
    }
    throw new Error(payload.error || "Upload thất bại");
  }
  return payload.attachment;
}

async function openAttachment(att) {
  if (!att || att.legacy || !att.id) return;
  try {
    const res = await apiFetch(att.url || `/api/attachments/${att.id}`);
    if (!res.ok) throw new Error("Không mở được file");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    alert(error.message || "Không tải được file");
  }
}

function renderAttachmentChipsHtml(attachments, { taskId, disabled } = {}) {
  const list = Array.isArray(attachments) ? attachments : [];
  if (!list.length) {
    return `<p class="item-meta attachment-empty">Chưa có file — đính kèm gửi tay trên Zalo (CRM lưu để theo dõi).</p>`;
  }
  return `<ul class="attachment-list">${list
    .map((att) => {
      const link = att.legacy
        ? `<span class="attachment-chip attachment-chip--legacy" title="Ghi chú tên file">${escapeHtml(att.name)}</span>`
        : `<button type="button" class="attachment-chip" data-open-attachment="${escapeHtml(att.id)}">${escapeHtml(att.name)}</button>`;
      const removeBtn =
        disabled || att.legacy
          ? ""
          : `<button type="button" class="attachment-remove" data-remove-attachment="${att.id}" data-task-id="${taskId || ""}" title="Xóa">×</button>`;
      const size = att.size ? `<span class="attachment-size">${formatFileSize(att.size)}</span>` : "";
      return `<li class="attachment-item">${link}${size}${removeBtn}</li>`;
    })
    .join("")}</ul>`;
}

function renderBroadcastCreateAttachments() {
  if (!refs.broadcastAttachmentsList) return;
  refs.broadcastAttachmentsList.innerHTML = renderAttachmentChipsHtml(broadcastCreateAttachments, {
    disabled: state.role === "responder",
  });
  refs.broadcastAttachmentsList.querySelectorAll("[data-remove-attachment]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove-attachment");
      const idx = broadcastCreateAttachments.findIndex((a) => a.id === id);
      if (idx >= 0) broadcastCreateAttachments.splice(idx, 1);
      renderBroadcastCreateAttachments();
    });
  });
}

async function addTaskAttachment(taskId, file) {
  if (!file || state.role === "responder") return;
  const campaignId = state.activeCampaignId;
  const tasks = state.tasksByCampaign[campaignId] || [];
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;
  try {
    const att = await uploadAttachmentFile(file);
    normalizeTaskAttachments(task);
    task.attachments.push(att);
    if (!String(task.attachment || "").trim()) task.attachment = att.name;
    task.updatedAt = Date.now();
    saveState();
    renderTasks();
  } catch (error) {
    alert(error.message || "Không upload được file");
  }
}

async function removeTaskAttachment(taskId, attachmentId) {
  const campaignId = state.activeCampaignId;
  const tasks = state.tasksByCampaign[campaignId] || [];
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;
  normalizeTaskAttachments(task);
  const att = task.attachments.find((a) => a.id === attachmentId);
  if (!att || att.legacy) return;
  try {
    await apiFetch(`/api/attachments/${attachmentId}`, { method: "DELETE" });
  } catch {
    /* ignore */
  }
  task.attachments = task.attachments.filter((a) => a.id !== attachmentId);
  if (task.attachments.length) task.attachment = task.attachments[0].name;
  else task.attachment = "";
  task.updatedAt = Date.now();
  saveState();
  renderTasks();
}

function newTask(groupId) {
  return {
    id: uid(),
    groupId,
    message: "",
    status: "pending",
    attachment: "",
    attachments: [],
    assignee: "",
    leadScore: 40,
    priority: "warm",
    sentAt: "",
    repliedAt: "",
    followUpAt: "",
    lastContactAt: "",
    note: "",
    updatedAt: Date.now(),
  };
}

function insertIntoFocusedMessage(text) {
  if (!text) return;
  const campaignId = state.activeCampaignId;
  if (!campaignId) return;
  let taskId = focusedMessageTaskId;
  if (!taskId) {
    const el = document.querySelector('textarea[data-field="message"]:focus');
    taskId = el?.getAttribute("data-id");
  }
  if (!taskId) {
    navigator.clipboard?.writeText(text);
    alert("Chọn ô tin nhắn trước — đã copy vào clipboard.");
    return;
  }
  const tasks = state.tasksByCampaign[campaignId] || [];
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;
  task.message = task.message ? `${task.message}\n${text}` : text;
  task.updatedAt = Date.now();
  saveState();
  renderTasks();
}

function bindTaskTemplateBar() {
  const tpl = document.getElementById("task-insert-template");
  const quick = document.getElementById("task-insert-quick");
  const applyBtn = document.getElementById("task-insert-apply");
  if (!tpl || !quick) return;

  const refresh = () => {
    tpl.innerHTML =
      `<option value="">— Chọn mẫu —</option>` +
      (state.messageTemplates || [])
        .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.title)}</option>`)
        .join("");
    quick.innerHTML =
      `<option value="">— /shortcut —</option>` +
      (state.quickReplies || [])
        .map((q) => `<option value="${escapeHtml(q.id)}">/${escapeHtml(q.shortcut)}</option>`)
        .join("");
  };

  applyBtn?.addEventListener("click", () => {
    const t = state.messageTemplates?.find((x) => x.id === tpl.value);
    const q = state.quickReplies?.find((x) => x.id === quick.value);
    insertIntoFocusedMessage(t?.body || q?.body || "");
  });

  document.addEventListener(
    "focusin",
    (e) => {
      if (e.target?.matches?.('textarea[data-field="message"]')) {
        focusedMessageTaskId = e.target.getAttribute("data-id");
      }
    },
    true,
  );

  bindTaskTemplateBar.refresh = refresh;
  refresh();
}

function zaloChatLinkHtml(group) {
  if (!group || typeof buildZaloChatUrl !== "function") return "";
  const url = buildZaloChatUrl(group);
  const tip =
    group.chatType === "user"
      ? "Mở chat Zalo cá nhân"
      : "Mở chat.zalo.me — tìm nhóm trong danh sách trái (hoặc dùng Gửi tin)";
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="zalo-open-chat" title="${escapeHtml(tip)}">💬 Mở Zalo</a>`;
}

function zaloGroupActionsHtml(group, task) {
  if (!group || !task) return "";
  const hasMsg = Boolean(String(task.message || "").trim());
  return `${zaloChatLinkHtml(group)}
    <button type="button" class="primary mini zalo-send-btn" data-send-task="${task.id}" title="${hasMsg ? "Gửi ngầm qua tab chat.zalo.me (không nhảy tab)" : "Soạn nội dung tin trước"}">Gửi Web</button>`;
}

function getTaskMessageFromDom(taskId) {
  const el = refs.taskTableWrap?.querySelector(`textarea[data-field="message"][data-id="${taskId}"]`);
  return String(el?.value ?? "").trim();
}

function showTaskSearchHint(text) {
  if (refs.taskSearchHint) refs.taskSearchHint.textContent = text || "";
}

let zaloCrmBridgeReady = Boolean(document.getElementById("zalo-crm-bridge-ready"));

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.type === "zalo-crm-bridge-ready") {
    zaloCrmBridgeReady = true;
    syncTokenToExtension();
    syncCampaignToExtension();
  }
});

function getExtensionSyncPayload() {
  return {
    syncToken: state.zaloSync?.token || "",
    crmBaseUrl: window.location.origin,
    campaignId: state.activeCampaignId || null,
  };
}

function syncTokenToExtension() {
  const payload = getExtensionSyncPayload();
  if (!payload.syncToken) return;
  window.postMessage({ type: "zalo-crm-set-sync", ...payload }, "*");
}

function syncCampaignToExtension() {
  if (!state.activeCampaignId) return;
  window.postMessage({ type: "zalo-crm-set-campaign", campaignId: state.activeCampaignId }, "*");
  syncTokenToExtension();
}

function pingExtension() {
  return new Promise((resolve) => {
    if (!zaloCrmBridgeReady && !document.getElementById("zalo-crm-bridge-ready")) {
      resolve({ ok: false, error: "Extension chưa kết nối — reload extension v1.6.2 + F5 CRM" });
      return;
    }
    const timeout = setTimeout(() => resolve({ ok: false, error: "Extension timeout" }), 10000);
    function onMessage(event) {
      if (event.source !== window || event.data?.type !== "zalo-crm-ping-result") return;
      window.removeEventListener("message", onMessage);
      clearTimeout(timeout);
      resolve(event.data.result || { ok: false });
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ type: "zalo-crm-ping-request", payload: getExtensionSyncPayload() }, "*");
  });
}

function formatExtensionChecklist(ping) {
  const lines = [
    `[ ] Extension + F5 CRM ${zaloCrmBridgeReady ? "✓" : "✗"}`,
    `[ ] Mã sync (CRM tự đẩy sang extension) ${ping?.hasToken ? "✓" : "✗ — bấm «Tạo mã đồng bộ» trong CRM"}`,
    `[ ] Tab chat.zalo.me trên Chrome ${ping?.zaloTabOpen ? "✓" : "✗"}`,
    `[ ] Extension chạy trên tab Zalo ${ping?.zaloScriptReady ? "✓" : "✗ — F5 tab chat.zalo.me"}`,
    `[ ] Zalo Web đã load danh sách chat ${ping?.zaloLoggedIn ? "✓" : "✗ — đăng nhập + thấy chat bên trái"}`,
    `[ ] Chiến dịch đã chọn ${state.activeCampaignId ? "✓" : "✗"}`,
  ];
  return lines.join("\n");
}

function requestExtensionSend(payload) {
  return new Promise((resolve) => {
    if (!zaloCrmBridgeReady && !document.getElementById("zalo-crm-bridge-ready")) {
      resolve({
        ok: false,
        error: "Extension chưa kết nối CRM — vào chrome://extensions Reload extension v1.6.2, rồi F5 trang CRM",
      });
      return;
    }
    const timeout = setTimeout(
      () => resolve({ ok: false, error: "Extension không phản hồi (timeout) — kiểm tra tab chat.zalo.me đang mở" }),
      45000,
    );
    function onMessage(event) {
      if (event.source !== window || event.data?.type !== "zalo-crm-send-result") return;
      window.removeEventListener("message", onMessage);
      clearTimeout(timeout);
      resolve(event.data.result || { ok: false });
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ type: "zalo-crm-send-request", payload }, "*");
  });
}

function markTaskSentFromPc(taskId) {
  const campaignId = state.activeCampaignId;
  if (!campaignId) {
    alert("Chọn chiến dịch trước.");
    return;
  }
  const tasks = state.tasksByCampaign[campaignId] || [];
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;
  const group = state.groups.find((g) => g.id === task.groupId);
  const message = getTaskMessageFromDom(taskId) || String(task.message || "").trim();
  if (message) task.message = message;
  const iso = new Date().toISOString();
  task.status = "sent";
  task.sentAt = task.sentAt || iso;
  task.updatedAt = Date.now();
  if (group) {
    const row = {
      id: `ix_${Date.now()}`,
      at: iso,
      type: "sent",
      summary: message ? `Gửi tay (Zalo PC): ${message.slice(0, 120)}` : "Gửi tay trên Zalo PC",
      by: currentUser?.username || "crm",
    };
    group.interactions = [row, ...(group.interactions || [])].slice(0, 50);
    group.lastInteractionAt = iso;
  }
  saveState();
  renderSummary();
  renderTasks();
  showTaskSearchHint(`✓ «${group?.name || "Nhóm"}» → Đã gửi (bạn gửi tay trên Zalo PC)`);
  setTimeout(() => showTaskSearchHint(""), 8000);
}

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendBroadcastToZalo(broadcastId, groupId) {
  const broadcast = state.broadcasts.find((b) => b.id === broadcastId);
  if (!broadcast) return { ok: false };
  const group = state.groups.find((g) => g.id === groupId);
  if (!group) {
    alert("Không tìm thấy nhóm.");
    return { ok: false };
  }
  const message = String(broadcast.message || "").trim();
  if (!message) {
    alert("Thông báo chưa có nội dung.");
    return { ok: false };
  }

  syncTokenToExtension();
  const ping = await pingExtension();
  if (!ping?.hasToken) {
    alert(`Chưa có mã đồng bộ:\n\n${formatExtensionChecklist(ping)}`);
    return { ok: false };
  }
  if (!ping?.zaloTabOpen) {
    window.open("https://chat.zalo.me/", "_blank", "noopener");
  }

  const btn = refs.broadcastWorkspace?.querySelector(`[data-broadcast-send="${groupId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang gửi...";
  }

  const extResult = await requestExtensionSend({
    groupName: group.name,
    zaloGroupId: group.zaloGroupId || "",
    message,
    chatUrl: "https://chat.zalo.me/",
    broadcastId,
    silent: true,
    ...getExtensionSyncPayload(),
  });

  if (btn) {
    btn.disabled = false;
    btn.textContent = "Gửi Web";
  }

  if (extResult?.ok) {
    await refreshStateFromServer();
    renderBroadcasts();
    return { ok: true };
  }

  const err = extResult?.error || "Extension chưa sẵn sàng";
  const marked = confirm(
    `${err}\n\nĐã gửi tay trên Zalo?\n\n• OK = Đánh dấu ĐÃ GỬI\n• Hủy = Copy nội dung`,
  );
  if (marked) {
    markBroadcastGroups(broadcastId, [groupId], true);
    return { ok: true };
  }
  try {
    await navigator.clipboard.writeText(message);
  } catch {
    /* ignore */
  }
  return { ok: false };
}

async function sendBroadcastBatch(broadcastId) {
  const ids = [...broadcastView.selectedGroupIds].filter((groupId) => {
    const broadcast = state.broadcasts.find((b) => b.id === broadcastId);
    const rec = broadcast?.recipients?.[groupId];
    return rec && rec.status !== "sent";
  });
  if (!ids.length) {
    alert("Chọn ít nhất một nhóm chưa gửi.");
    return;
  }
  if (!confirm(`Gửi Web ngầm tới ${ids.length} nhóm? (cách nhau ~2 giây)`)) return;

  let ok = 0;
  for (const groupId of ids) {
    const result = await sendBroadcastToZalo(broadcastId, groupId);
    if (result?.ok) ok += 1;
    await sleepMs(2000);
  }
  alert(`Hoàn tất: ${ok}/${ids.length} nhóm.`);
  renderBroadcastWorkspace();
}

async function sendTaskToZalo(taskId) {
  const campaignId = state.activeCampaignId;
  if (!campaignId) {
    alert("Chọn chiến dịch đang chạy trước.");
    return;
  }
  const tasks = state.tasksByCampaign[campaignId] || [];
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;
  const group = state.groups.find((g) => g.id === task.groupId);
  if (!group) {
    alert("Không tìm thấy nhóm.");
    return;
  }
  const message = getTaskMessageFromDom(taskId) || String(task.message || "").trim();
  if (!message) {
    alert("Soạn nội dung tin trong ô «Nội dung tin riêng» trước khi gửi.");
    const ta = refs.taskTableWrap?.querySelector(`textarea[data-field="message"][data-id="${taskId}"]`);
    ta?.focus();
    return;
  }
  task.message = message;
  saveState();
  syncCampaignToExtension();
  syncTokenToExtension();

  const ping = await pingExtension();
  if (!ping?.hasToken) {
    alert(
      `Chưa có mã đồng bộ:\n\n${formatExtensionChecklist(ping)}\n\n① CRM → «Tạo / làm mới mã đồng bộ» (Admin) → F5 CRM → thử lại.`,
    );
    return;
  }
  if (!ping?.zaloTabOpen) {
    window.open("https://chat.zalo.me/", "_blank", "noopener");
    showTaskSearchHint("Đã mở chat.zalo.me — đăng nhập rồi bấm Gửi (Web) lại");
  } else if (!ping?.zaloScriptReady) {
    showTaskSearchHint("Tab chat.zalo.me cần F5 sau khi reload extension v1.6.2 — vẫn thử gửi ngầm...");
  } else if (!ping?.zaloLoggedIn) {
    showTaskSearchHint("Đăng nhập Zalo Web (thấy danh sách chat bên trái) — vẫn thử gửi...");
  }

  const btn = refs.taskTableWrap?.querySelector(`[data-send-task="${taskId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang gửi...";
  }
  const attNote = taskHasAttachments(task)
    ? " (có file đính kèm — gửi file tay trên Zalo sau khi gửi tin)"
    : "";
  showTaskSearchHint(`Đang gửi ngầm «${group.name}»${attNote}...`);

  const chatUrl = "https://chat.zalo.me/";
  const extResult = await requestExtensionSend({
    groupName: group.name,
    zaloGroupId: group.zaloGroupId || "",
    message,
    chatUrl,
    campaignId,
    taskId,
    silent: true,
    ...getExtensionSyncPayload(),
  });

  if (btn) {
    btn.disabled = false;
    btn.textContent = "📤 Gửi (Web)";
  }

  if (extResult?.ok) {
    task.status = "sent";
    task.sentAt = task.sentAt || new Date().toISOString();
    task.updatedAt = Date.now();
    saveState();
    await refreshStateFromServer();
    renderTasks();
    showTaskSearchHint(`✓ Đã gửi tin tới «${group.name}» — trạng thái: Đã gửi`);
    setTimeout(() => showTaskSearchHint(""), 10000);
    return;
  }

  const err = extResult?.error || "Extension chưa sẵn sàng";
  const marked = confirm(
    `${err}\n\nBạn dùng App Zalo PC?\n\n• OK = Đánh dấu ĐÃ GỬI ngay (nếu bạn đã gửi tin trên Zalo PC)\n• Hủy = Copy tin để gửi thủ công`,
  );
  if (marked) {
    markTaskSentFromPc(taskId);
    return;
  }
  try {
    await navigator.clipboard.writeText(message);
  } catch {
    /* ignore */
  }
  window.open(chatUrl, "_blank", "noopener");
  showTaskSearchHint("Đã copy tin — gửi trên Zalo rồi đổi trạng thái sang «Đã gửi» trên thẻ nhóm");
}

function renderAll() {
  refs.role.value = currentUser?.role || "admin";
  renderGroups();
  renderCampaigns();
  renderCampaignSelector();
  renderBroadcasts();
  renderSummary();
  renderAssigneeAnalytics();
  bindTaskTemplateBar.refresh?.();
  renderTasks();
  crmFullUi?.render();
  crmInboxUi?.render();
  if (typeof applyPlanUi === "function") applyPlanUi();
}

function setAuthUi() {
  const roleLabels = { admin: "Quản trị", editor: "Người soạn tin", responder: "Người trả lời" };
  const label = roleLabels[currentUser.role] || currentUser.role;
  const emailPart = currentUser.email ? ` · ${currentUser.email}` : "";
  refs.authInfo.textContent = `${currentUser.username}${emailPart} · ${label}`;
  refs.authInfo.classList.remove("error");
  applyAdminNavVisibility();
}

function applyAdminNavVisibility() {
  const isAdmin = currentUser?.role === "admin";
  document.querySelectorAll(".app-nav-item--admin").forEach((el) => {
    el.classList.toggle("hidden", !isAdmin);
  });
}

function redirectToLogin(reason) {
  clearAuthTokens();
  const query = reason ? `?${reason}=1` : "";
  window.location.href = `/login.html${query}`;
}

async function handleLogout() {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await fetch("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Ignore network errors during logout.
    }
  }
  redirectToLogin();
}

async function fetchMe() {
  if (!getAccessToken()) return null;
  try {
    const response = await apiFetch("/api/me");
    if (response.status === 401) {
      redirectToLogin("expired");
      return null;
    }
    if (response.status === 403) {
      const payload = await response.json().catch(() => ({}));
      if (payload.code === "TRIAL_EXPIRED") {
        clearAuthTokens();
        window.location.href = "/login.html?trial=expired";
        return null;
      }
    }
    if (!response.ok) return null;
    const payload = await response.json();
    return payload.user || null;
  } catch {
    return null;
  }
}

function setActiveCampaignId(campaignId) {
  state.activeCampaignId = campaignId || null;
  syncCampaignToExtension();
  resetTaskPage();
  saveState();
  renderCampaignSelector();
  renderSummary();
  renderTasks();
  renderZaloSyncStatus();
  renderAssigneeAnalytics();
}

function initAppNav() {
  const nav = refs.appNav;
  if (!nav) return;
  const views = document.querySelectorAll(".app-view");
  const saved = localStorage.getItem("crm_active_view") || "tasks";

  function show(viewId) {
    views.forEach((v) => v.classList.toggle("active", v.dataset.view === viewId));
    nav.querySelectorAll(".app-nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === viewId);
    });
    localStorage.setItem("crm_active_view", viewId);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (viewId === "users" && typeof refreshTeamUsersPanel === "function") {
      refreshTeamUsersPanel();
    }
  }

  nav.addEventListener("click", (e) => {
    const btn = e.target.closest(".app-nav-item[data-view]");
    if (!btn) return;
    if (btn.dataset.planLocked === "1") {
      e.preventDefault();
      notifyPlanBlocked("broadcast");
      return;
    }
    show(btn.dataset.view);
  });

  show(saved);
  switchAppView = show;
}

function renderSummary() {
  const campaignId = state.activeCampaignId;
  if (!refs.summaryCards) return;
  if (!campaignId) {
    refs.summaryCards.innerHTML = `<p class="item-meta empty-hint">Chọn chiến dịch để xem tổng quan.</p>`;
    return;
  }

  const tasks = state.tasksByCampaign[campaignId] || [];
  const summary = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === "pending").length,
    sent: tasks.filter((t) => t.status === "sent").length,
    replying: tasks.filter((t) => t.status === "replying").length,
    done: tasks.filter((t) => t.status === "done").length,
    hot: tasks.filter((t) => t.priority === "hot").length,
    overdue: tasks.filter((t) => isOverdue(t.followUpAt) && t.status !== "done").length,
  };
  const completionRate = summary.total ? Math.round((summary.done / summary.total) * 100) : 0;

  const cards = [
    { value: summary.total, label: "Tổng nhóm", tone: "blue" },
    { value: summary.pending, label: "Chưa gửi", tone: "slate" },
    { value: summary.sent, label: "Đã gửi", tone: "indigo" },
    { value: summary.replying, label: "Đang trả lời", tone: "amber" },
    { value: summary.hot, label: "Lead nóng", tone: "rose" },
    { value: `${completionRate}%`, label: "Hoàn tất", tone: "green" },
    { value: summary.overdue, label: "Quá hạn", tone: "red" },
  ];

  refs.summaryCards.innerHTML = cards
    .map(
      (c) => `
    <article class="summary-card summary-card--${c.tone}">
      <h3>${c.value}</h3>
      <p>${c.label}</p>
    </article>`,
    )
    .join("");
}

async function refreshStateFromServer() {
  try {
    const response = await apiFetch("/api/state");
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload?.state) return;
    state = { ...structuredClone(initialState), ...payload.state, role: currentUser.role };
    normalizeBroadcastsInState();
    normalizeTasksInState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
    renderZaloSyncStatus();
    refreshExtensionHealth();
  } catch {
    // ignore
  }
}

function startSyncPolling() {
  if (syncPollTimer) clearInterval(syncPollTimer);
  syncPollTimer = setInterval(() => {
    if (document.hidden) return;
    refreshStateFromServer();
    refreshExtensionHealth();
  }, 10000);
}

function bindZaloSyncUi() {
  renderZaloSyncStatus();
}

function renderZaloSyncStatus() {
  const sync = state.zaloSync || {};
  const campaign = state.campaigns.find((c) => c.id === state.activeCampaignId);
  if (refs.zaloSyncToken) {
    if (sync.token) {
      refs.zaloSyncToken.textContent = sync.token;
      refs.zaloSyncToken.classList.remove("hidden");
    } else {
      refs.zaloSyncToken.classList.add("hidden");
    }
  }
  if (!refs.zaloSyncStatus) return;
  if (!sync.token) {
    refs.zaloSyncStatus.textContent = "Chưa có mã đồng bộ — bấm Tạo mã, cài extension, rồi gửi tin trên Zalo Web.";
    return;
  }
  const parts = [
    sync.enabled !== false ? "Đồng bộ: Bật" : "Đồng bộ: Tắt",
    campaign ? `Chiến dịch: ${campaign.name}` : "Chưa chọn chiến dịch",
  ];
  if (sync.lastSyncAt) {
    parts.push(`Lần cuối: ${new Date(sync.lastSyncAt).toLocaleString()}`);
    if (sync.lastGroupName) parts.push(`Nhóm: ${sync.lastGroupName}`);
  }
  refs.zaloSyncStatus.textContent = parts.join(" · ");
}

async function refreshExtensionHealth() {
  if (!refs.extensionHealthList) return;
  try {
    const response = await apiFetch("/api/sync/status");
    if (!response.ok) return;
    const payload = await response.json();
    const health = payload.extensionHealth;
    if (!health) return;
    const rows = health.accounts || [];
    if (!rows.length) {
      refs.extensionHealthList.innerHTML = `<li class="item-meta">Thêm tài khoản Zalo trong CRM Full để theo dõi extension.</li>`;
      return;
    }
    refs.extensionHealthList.innerHTML = rows
      .map((row) => {
        const badge = row.online
          ? `<span class="ext-status ext-online">Online</span>`
          : `<span class="ext-status ext-offline">Offline — kiểm tra trình duyệt</span>`;
        const when = row.lastHeartbeatAt
          ? new Date(row.lastHeartbeatAt).toLocaleString()
          : "chưa có tín hiệu";
        return `<li class="list-item">
          <div><strong>${escapeHtml(row.name)}</strong> ${badge}
          <div class="item-meta">Heartbeat: ${escapeHtml(when)}${row.extensionVersion ? ` · v${escapeHtml(row.extensionVersion)}` : ""}</div></div>
        </li>`;
      })
      .join("");
    const offline = health.offlineCount || 0;
    if (offline > 0 && refs.zaloSyncStatus && currentUser?.role === "admin") {
      refs.zaloSyncStatus.textContent += ` · ⚠ ${offline} extension offline`;
    }
  } catch {
    // ignore
  }
}

async function renderAssigneeAnalytics() {
  if (!refs.assigneeAnalytics) return;
  const campaignId = state.activeCampaignId;
  if (!campaignId) {
    refs.assigneeAnalytics.innerHTML = `<p class="item-meta">Chọn chiến dịch để xem hiệu suất nhân viên.</p>`;
    return;
  }
  try {
    const response = await apiFetch(`/api/analytics/assignees?campaignId=${encodeURIComponent(campaignId)}`);
    const payload = await response.json();
    const rows = payload.rows || [];
    if (!rows.length) {
      refs.assigneeAnalytics.innerHTML = `<p class="item-meta">Chưa có dữ liệu assignee trong chiến dịch này.</p>`;
      return;
    }
    refs.assigneeAnalytics.innerHTML = `<table>
      <thead><tr>
        <th>Nhân viên</th><th>Tổng task</th><th>Chưa gửi</th><th>Tỉ lệ phản hồi</th><th>TB phản hồi</th><th>Khách nóng</th>
      </tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr>
            <td><strong>${escapeHtml(r.assignee)}</strong></td>
            <td>${r.total}</td>
            <td>${r.pending}</td>
            <td>${r.responseRate}%</td>
            <td>${escapeHtml(r.avgResponseLabel)}</td>
            <td>${r.hot}</td>
          </tr>`,
        )
        .join("")}</tbody></table>`;
  } catch {
    refs.assigneeAnalytics.innerHTML = `<p class="item-meta">Không tải được analytics.</p>`;
  }
}

async function setupZaloSync() {
  if (currentUser?.role !== "admin") {
    if (refs.zaloSyncStatus) refs.zaloSyncStatus.textContent = "Chỉ admin tạo mã đồng bộ.";
    return;
  }
  if (refs.zaloSyncStatus) refs.zaloSyncStatus.textContent = "Đang tạo mã...";
  try {
    const response = await apiFetch("/api/sync/setup", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Setup failed");
    state = { ...state, ...payload.state, role: currentUser.role };
    saveState();
    renderZaloSyncStatus();
    syncTokenToExtension();
    if (refs.zaloSyncStatus) {
      refs.zaloSyncStatus.textContent += " — Mã đã tự đẩy sang extension (F5 CRM nếu cần).";
    }
  } catch (e) {
    if (refs.zaloSyncStatus) refs.zaloSyncStatus.textContent = e.message || "Lỗi tạo mã.";
  }
}

async function copyZaloSyncToken() {
  const token = state.zaloSync?.token || refs.zaloSyncToken?.textContent || "";
  if (!token) {
    if (refs.zaloSyncStatus) refs.zaloSyncStatus.textContent = "Chưa có mã — bấm Tạo mã trước.";
    return;
  }
  try {
    await navigator.clipboard.writeText(token);
    if (refs.zaloSyncStatus) refs.zaloSyncStatus.textContent = "Đã copy mã — dán vào extension trên Zalo Web.";
  } catch {
    if (refs.zaloSyncStatus) refs.zaloSyncStatus.textContent = "Copy thủ công từ ô mã bên dưới.";
  }
}

function normalizePhoneClient(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

function bindDedupModal() {
  document.getElementById("dedup-merge-cancel")?.addEventListener("click", () => {
    pendingDedupImport = null;
    refs.dedupModal?.classList.add("hidden");
    groupImportWizard?.setResult?.("Đã hủy import.");
  });
  document.getElementById("dedup-merge-skip")?.addEventListener("click", () => {
    if (!pendingDedupImport) return;
    const { groups } = pendingDedupImport;
    pendingDedupImport = null;
    refs.dedupModal?.classList.add("hidden");
    runBulkImport(groups, []);
  });
  document.getElementById("dedup-merge-confirm")?.addEventListener("click", () => {
    if (!pendingDedupImport) return;
    const { groups, duplicates } = pendingDedupImport;
    const mergeRows = [];
    refs.dedupList?.querySelectorAll("[data-dedup-idx]").forEach((el) => {
      const idx = Number(el.getAttribute("data-dedup-idx"));
      if (el.checked) mergeRows.push(duplicates[idx]);
    });
    pendingDedupImport = null;
    refs.dedupModal?.classList.add("hidden");
    runBulkImport(groups, mergeRows);
  });
}

function showDedupModal(groups, duplicates) {
  pendingDedupImport = { groups, duplicates };
  if (!refs.dedupList || !refs.dedupModal) {
    runBulkImport(groups, duplicates);
    return;
  }
  refs.dedupList.innerHTML = duplicates
    .map(
      (d, i) => `<li class="list-item">
        <label>
          <input type="checkbox" data-dedup-idx="${i}" checked />
          <span><strong>SĐT ${escapeHtml(d.phone)}</strong><br/>
          <span class="item-meta">CRM: ${escapeHtml(d.existing.name)} · Import: ${escapeHtml(d.incoming.name)}</span></span>
        </label>
      </li>`,
    )
    .join("");
  refs.dedupModal.classList.remove("hidden");
}

async function runBulkImport(groups, mergeAfter) {
  const response = await apiFetch("/api/groups/bulk-import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groups, skipDuplicates: true, updateExisting: true }),
  });
  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 403 && payload.code?.startsWith("PLAN_") && typeof notifyPlanBlocked === "function") {
      notifyPlanBlocked("groups");
    }
    throw new Error(payload.error || "Import failed");
  }
  state = { ...state, ...payload.state, role: currentUser.role };
  window.__crmStateRef = state;
  syncTasksWithGroups();

  let merged = 0;
  for (const d of mergeAfter || []) {
    const phone = normalizePhoneClient(d.phone);
    const candidate = state.groups.find(
      (g) =>
        g.id !== d.existing.id &&
        normalizePhoneClient(g.phone) === phone &&
        (g.zaloGroupId === d.incoming.zaloGroupId || g.name === d.incoming.name),
    );
    if (!candidate) continue;
    const mergeRes = await apiFetch("/api/crm/merge-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepId: d.existing.id, mergeId: candidate.id }),
    });
    const mergePayload = await mergeRes.json();
    if (mergeRes.ok && mergePayload.state) {
      state = { ...mergePayload.state, role: currentUser.role };
      merged += 1;
    }
  }

  saveState();
  renderAll();
  groupImportWizard?.clearAfterImport?.();
  groupImportWizard?.setResult?.(
    `+${payload.imported} nhóm, bỏ qua ${payload.skipped}. Gộp ${merged} trùng SĐT. Tổng ${state.groups.length} nhóm.`,
  );
}

async function importGroupsToCrm(groups) {
  const dupRes = await apiFetch("/api/groups/check-duplicates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groups }),
  });
  const dupPayload = await dupRes.json();
  if (!dupRes.ok) throw new Error(dupPayload.error || "Check duplicates failed");
  if (dupPayload.count > 0) {
    showDedupModal(groups, dupPayload.duplicates);
    return;
  }
  await runBulkImport(groups, []);
}

function groupChatType(group) {
  return group.chatType === "user" ? "user" : group.chatType === "unknown" ? "unknown" : "group";
}

function campaignEligibleGroups() {
  return state.groups.filter((g) => groupChatType(g) !== "user");
}

function labelGroupChatType(chatType) {
  if (chatType === "user") return "Ca nhan";
  if (chatType === "unknown") return "Chua ro";
  return "Nhom";
}

function renderGroups() {
  const all = state.groups || [];
  const groupCount = all.filter((g) => groupChatType(g) === "group").length;
  const userCount = all.filter((g) => groupChatType(g) === "user").length;
  if (refs.groupCount) {
    refs.groupCount.textContent = `(${groupCount} nhóm · ${userCount} cá nhân)`;
  }
  let visible =
    groupListTypeFilter === "all"
      ? all
      : all.filter((g) => groupChatType(g) === groupListTypeFilter);
  const segFilter = crmFullUi?.getSegmentFilter?.() || "all";
  if (segFilter !== "all") {
    visible = visible.filter((g) => (g.segment || "lead") === segFilter);
  }

  const q = groupListSearch.toLowerCase();
  if (q) {
    visible = visible.filter((g) => {
      const hay = [
        g.name,
        g.owner,
        g.phone,
        g.zaloGroupId,
        cleanDisplayGroupName(g.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  if (refs.groupSearchHint) {
    if (!all.length) {
      refs.groupSearchHint.textContent = "Chưa có nhóm — bấm «Import nhóm từ Zalo / CSV» phía trên.";
    } else if (q) {
      refs.groupSearchHint.textContent =
        visible.length > 0
          ? `Tìm «${groupListSearch}»: ${visible.length} kết quả`
          : `Không có nhóm nào khớp «${groupListSearch}» — thử từ khác hoặc bấm «Tất cả»`;
    } else {
      refs.groupSearchHint.textContent = `Hiển thị ${visible.length} / ${all.length} mục`;
    }
  }

  refs.groupList.innerHTML = "";
  if (!visible.length) {
    const msg = q
      ? `Không tìm thấy «${escapeHtml(groupListSearch)}».`
      : all.length
        ? "Không có mục nào trong bộ lọc này."
        : "Chưa có nhóm. Bấm «Import nhóm từ Zalo / CSV» để bắt đầu.";
    refs.groupList.innerHTML = `<li class="item-meta groups-empty">${msg}</li>`;
    return;
  }
  visible
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((group) => {
      const li = document.createElement("li");
      const type = groupChatType(group);
      const metaParts = [group.owner ? escapeHtml(group.owner) : "Chưa gán"];
      if (group.phone) metaParts.push(escapeHtml(group.phone));
      li.className = "list-item group-card";
      li.innerHTML = `
        <div class="group-card-main">
          <div class="group-card-title-row">
            <strong class="group-card-name" title="${escapeHtml(group.name)}${group.zaloGroupId ? ` · ID: ${escapeHtml(group.zaloGroupId)}` : ""}">${escapeHtml(truncateText(cleanDisplayGroupName(group.name), 36))}</strong>
            <span class="badge ${type === "user" ? "cold" : "warm"}">${labelGroupChatType(type)}</span>
          </div>
          <div class="group-card-meta">${metaParts.join(" · ")}</div>
          ${zaloChatLinkHtml(group)}
        </div>
        <div class="group-card-btns">
          <button type="button" class="secondary mini" data-action="profile-group" data-id="${group.id}">Hồ sơ</button>
          <button type="button" class="secondary mini btn-danger-text" data-action="delete-group" data-id="${group.id}" ${state.role !== "admin" ? "disabled" : ""}>Xóa</button>
        </div>
      `;
      refs.groupList.appendChild(li);
    });

  refs.groupList.querySelectorAll("[data-action='profile-group']").forEach((btn) => {
    btn.addEventListener("click", () => {
      crmFullUi?.openProfile(btn.getAttribute("data-id"));
    });
  });

  refs.groupList.querySelectorAll("[data-action='delete-group']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      state.groups = state.groups.filter((g) => g.id !== id);
      syncTasksWithGroups();
      saveState();
      renderAll();
    });
  });
}

function renderCampaigns() {
  refs.campaignList.innerHTML = "";
  state.campaigns
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((campaign) => {
      const li = document.createElement("li");
      const isActive = state.activeCampaignId === campaign.id;
      li.className = `list-item campaign-card${isActive ? " campaign-card--active" : ""}`;
      li.innerHTML = `
        <div class="campaign-card-main">
          <strong>${escapeHtml(campaign.name)}</strong>
          ${campaign.note ? `<div class="item-meta">${escapeHtml(truncateText(campaign.note, 60))}</div>` : ""}
        </div>
        <div class="group-card-btns">
          <button type="button" class="primary mini" data-action="use-campaign" data-id="${campaign.id}">Soạn tin →</button>
          <button type="button" class="secondary mini btn-danger-text" data-action="delete-campaign" data-id="${campaign.id}" ${state.role !== "admin" ? "disabled" : ""}>Xóa</button>
        </div>
      `;
      refs.campaignList.appendChild(li);
    });

  refs.campaignList.querySelectorAll("[data-action='use-campaign']").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveCampaignId(btn.getAttribute("data-id"));
      switchAppView("tasks");
    });
  });

  refs.campaignList.querySelectorAll("[data-action='delete-campaign']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      state.campaigns = state.campaigns.filter((c) => c.id !== id);
      delete state.tasksByCampaign[id];
      if (state.activeCampaignId === id) {
        state.activeCampaignId = state.campaigns[0]?.id || null;
      }
      saveState();
      renderAll();
    });
  });
}

function renderCampaignSelector() {
  const optionsHtml = `<option value="">— Chọn chiến dịch —</option>${state.campaigns
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("")}`;
  const value = state.activeCampaignId || "";
  if (refs.activeCampaign) {
    refs.activeCampaign.innerHTML = optionsHtml;
    refs.activeCampaign.value = value;
  }
  if (refs.activeCampaignDashboard) {
    refs.activeCampaignDashboard.innerHTML = optionsHtml;
    refs.activeCampaignDashboard.value = value;
  }
}

function renderTasks() {
  const campaignId = state.activeCampaignId;
  if (!campaignId) {
    refs.taskTableWrap.innerHTML = `<p class="item-meta">Chua co chien dich nao duoc chon.</p>`;
    refs.paginationBar.classList.add("hidden");
    refs.filterSummary.textContent = "";
    return;
  }

  const allFiltered = getFilteredTasks(campaignId);
  const total = allFiltered.length;
  const pageCount = Math.max(1, Math.ceil(total / taskView.pageSize));
  if (taskView.page > pageCount) taskView.page = pageCount;
  if (taskView.page < 1) taskView.page = 1;

  const start = (taskView.page - 1) * taskView.pageSize;
  const rows = allFiltered.slice(start, start + taskView.pageSize);

  renderFilterSummary(total, allFiltered);
  renderPaginationBar(total, pageCount, start, rows.length);
  const q = refs.taskSearch?.value?.trim();
  if (q && refs.taskSearchHint && !refs.taskSearchHint.textContent.includes("Đã copy tin")) {
    showTaskSearchHint(`Đang lọc «${q}» — ${total} kết quả`);
  } else if (!q) {
    showTaskSearchHint(total ? `${total} nhóm trong bộ lọc hiện tại` : "");
  }

  if (!total) {
    refs.taskTableWrap.innerHTML = `<p class="item-meta">Khong co cong viec theo bo loc hien tai.</p>`;
    return;
  }

  refs.taskTableWrap.innerHTML = `
    <div class="task-cards">
      ${rows
        .map((task) => {
          const group = state.groups.find((g) => g.id === task.groupId);
          return renderTaskCard(task, group);
        })
        .join("")}
    </div>
  `;

  refs.taskTableWrap.querySelectorAll("[data-field]").forEach((input) => {
    const isStatus = input.getAttribute("data-field") === "status";
    const eventName = isStatus ? "change" : "blur";
    input.addEventListener(eventName, () => updateTaskField(input));
  });

  refs.taskTableWrap.querySelectorAll("[data-quick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const taskId = btn.getAttribute("data-id");
      const mode = btn.getAttribute("data-quick");
      quickSetFollowup(taskId, mode);
    });
  });

  refs.taskTableWrap.querySelectorAll("[data-send-task]").forEach((btn) => {
    btn.addEventListener("click", () => {
      sendTaskToZalo(btn.getAttribute("data-send-task"));
    });
  });

  refs.taskTableWrap.querySelectorAll("[data-task-attachment-input]").forEach((input) => {
    input.addEventListener("change", async (e) => {
      const taskId = input.getAttribute("data-task-attachment-input");
      const files = [...(e.target.files || [])];
      e.target.value = "";
      for (const file of files) await addTaskAttachment(taskId, file);
    });
  });

  refs.taskTableWrap.querySelectorAll("[data-remove-attachment]").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeTaskAttachment(btn.getAttribute("data-task-id"), btn.getAttribute("data-remove-attachment"));
    });
  });

  refs.taskTableWrap.querySelectorAll("[data-open-attachment]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open-attachment");
      const campaignId = state.activeCampaignId;
      const task = (state.tasksByCampaign[campaignId] || []).find((t) =>
        normalizeTaskAttachments(t).attachments.some((a) => a.id === id),
      );
      const att = task ? normalizeTaskAttachments(task).attachments.find((a) => a.id === id) : null;
      if (att) openAttachment(att);
    });
  });
}

function updateTaskField(el) {
  const campaignId = state.activeCampaignId;
  const field = el.getAttribute("data-field");
  const taskId = el.getAttribute("data-id");
  const tasks = state.tasksByCampaign[campaignId] || [];
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;

  const datetimeFields = new Set(["followUpAt", "lastContactAt"]);
  if (field === "leadScore") {
    task[field] = Number(el.value || 0);
  } else if (datetimeFields.has(field)) {
    task[field] = fromDateTimeLocal(el.value);
  } else {
    task[field] = el.value;
  }
  if (field === "status") {
    const iso = new Date().toISOString();
    if (el.value === "sent" && !task.sentAt) task.sentAt = iso;
    if ((el.value === "replying" || el.value === "done") && !task.repliedAt) task.repliedAt = iso;
  }
  if (field === "leadScore" && state.role !== "responder") {
    task.priority = autoPriorityFromScore(task.leadScore);
  }
  task.updatedAt = Date.now();

  if (state.role === "responder" && field !== "status") {
    return;
  }

  saveState();
  renderSummary();
  renderTasks();
}

function getFilteredTasks(campaignId) {
  const tasks = state.tasksByCampaign[campaignId] || [];
  const statusFilter = refs.statusFilter.value;
  const priorityFilter = refs.priorityFilter.value;
  const followupFilter = refs.followupFilter.value;
  const searchQuery = refs.taskSearch.value.trim().toLowerCase();
  const assigneeMode = refs.assigneeFilter.value;
  const assigneeQuery = refs.assigneeCustom.value.trim().toLowerCase();
  const scoreMin = refs.scoreMin.value === "" ? null : Number(refs.scoreMin.value);
  const scoreMax = refs.scoreMax.value === "" ? null : Number(refs.scoreMax.value);
  const hasAttachmentOnly = refs.filterHasAttachment.checked;
  const unassignedGroupOnly = refs.filterUnassigned.checked;

  const filtered = tasks.filter((task) => {
    const group = state.groups.find((g) => g.id === task.groupId);
    if (statusFilter !== "all" && task.status !== statusFilter) return false;
    if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
    if (!passFollowupFilter(task, followupFilter)) return false;
    if (hasAttachmentOnly && !taskHasAttachments(task)) return false;
    if (unassignedGroupOnly && String(group?.owner || "").trim()) return false;
    if (!passAssigneeFilter(task, assigneeMode, assigneeQuery)) return false;
    if (!passScoreFilter(task, scoreMin, scoreMax)) return false;
    if (!passSearchFilter(task, group, searchQuery)) return false;
    return true;
  });

  return sortTasks(filtered, refs.sortBy.value);
}

function passAssigneeFilter(task, mode, customQuery) {
  const assignee = String(task.assignee || "").trim().toLowerCase();
  if (mode === "all") return true;
  if (mode === "unassigned") return !assignee;
  if (mode === "custom") {
    if (!customQuery) return true;
    return assignee.includes(customQuery);
  }
  return true;
}

function passScoreFilter(task, min, max) {
  const score = Number(task.leadScore ?? 0);
  if (min !== null && !Number.isNaN(min) && score < min) return false;
  if (max !== null && !Number.isNaN(max) && score > max) return false;
  return true;
}

function passSearchFilter(task, group, query) {
  if (!query) return true;
  const haystack = [
    group?.name,
    group?.owner,
    task.message,
    task.note,
    task.assignee,
    task.attachment,
    ...(normalizeTaskAttachments(task).attachments || []).map((a) => a.name),
    labelStatus(task.status),
    labelPriority(task.priority),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function sortTasks(tasks, sortBy) {
  const list = [...tasks];
  const groupName = (task) => {
    const group = state.groups.find((g) => g.id === task.groupId);
    return (group?.name || "").toLowerCase();
  };

  list.sort((a, b) => {
    if (sortBy === "group_asc") return groupName(a).localeCompare(groupName(b));
    if (sortBy === "group_desc") return groupName(b).localeCompare(groupName(a));
    if (sortBy === "score_desc") return Number(b.leadScore || 0) - Number(a.leadScore || 0);
    if (sortBy === "score_asc") return Number(a.leadScore || 0) - Number(b.leadScore || 0);
    if (sortBy === "followup_asc") return compareFollowup(a, b, "asc");
    if (sortBy === "followup_desc") return compareFollowup(a, b, "desc");
    if (sortBy === "updated_asc") return Number(a.updatedAt || 0) - Number(b.updatedAt || 0);
    return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
  });
  return list;
}

function compareFollowup(a, b, direction) {
  const aTs = toTimestamp(a.followUpAt) || Number.MAX_SAFE_INTEGER;
  const bTs = toTimestamp(b.followUpAt) || Number.MAX_SAFE_INTEGER;
  if (aTs === bTs) return 0;
  return direction === "asc" ? aTs - bTs : bTs - aTs;
}

function renderFilterSummary(total, rows) {
  const campaignId = state.activeCampaignId;
  const allCount = (state.tasksByCampaign[campaignId] || []).length;
  const overdue = rows.filter((t) => isOverdue(t.followUpAt) && t.status !== "done").length;
  const parts = [`Hien thi ${total}/${allCount} task theo bo loc`];
  if (overdue) parts.push(`${overdue} qua han trong bo loc`);
  if (hasActiveFilters()) parts.push("(co bo loc nang cao)");
  refs.filterSummary.textContent = parts.join(" · ");
}

function hasActiveFilters() {
  return (
    refs.taskSearch.value.trim() ||
    refs.assigneeFilter.value !== "all" ||
    refs.scoreMin.value !== "" ||
    refs.scoreMax.value !== "" ||
    refs.filterHasAttachment.checked ||
    refs.filterUnassigned.checked ||
    refs.statusFilter.value !== "all" ||
    refs.priorityFilter.value !== "all" ||
    refs.followupFilter.value !== "all"
  );
}

function renderPaginationBar(total, pageCount, startIndex, pageRows) {
  if (total <= 0) {
    refs.paginationBar.classList.add("hidden");
    return;
  }

  refs.paginationBar.classList.remove("hidden");
  if (refs.pageSize.value !== String(taskView.pageSize)) {
    refs.pageSize.value = String(taskView.pageSize);
  }
  const from = total ? startIndex + 1 : 0;
  const to = startIndex + pageRows;
  refs.paginationInfo.textContent = `Dong ${from}-${to} / ${total}`;
  refs.pageIndicator.textContent = `Trang ${taskView.page}/${pageCount}`;
  refs.pagePrev.disabled = taskView.page <= 1;
  refs.pageNext.disabled = taskView.page >= pageCount;
}

function resetTaskPage() {
  taskView.page = 1;
}

function clearTaskFilters() {
  refs.statusFilter.value = "all";
  refs.priorityFilter.value = "all";
  refs.followupFilter.value = "all";
  refs.taskSearch.value = "";
  refs.assigneeFilter.value = "all";
  refs.assigneeCustom.value = "";
  refs.assigneeCustomWrap.classList.add("hidden");
  refs.scoreMin.value = "";
  refs.scoreMax.value = "";
  refs.sortBy.value = "updated_desc";
  refs.filterHasAttachment.checked = false;
  refs.filterUnassigned.checked = false;
  resetTaskPage();
  renderTasks();
}

function debounce(fn, waitMs) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

function applyBulkAssignee() {
  if (state.role === "responder") return;
  const campaignId = state.activeCampaignId;
  if (!campaignId) {
    alert("Hay chon chien dich.");
    return;
  }
  const assignee = refs.bulkAssignee.value.trim();
  if (!assignee) {
    alert("Nhap ten nguoi xu ly truoc.");
    return;
  }
  const rows = getFilteredTasks(campaignId);
  if (!rows.length) {
    alert("Khong co task nao theo bo loc hien tai.");
    return;
  }
  rows.forEach((task) => {
    task.assignee = assignee;
    task.updatedAt = Date.now();
  });
  saveState();
  renderSummary();
  renderTasks();
}

function bulkUpdateStatus(status) {
  const campaignId = state.activeCampaignId;
  if (!campaignId) {
    alert("Hay chon chien dich.");
    return;
  }
  const rows = getFilteredTasks(campaignId);
  if (!rows.length) {
    alert("Khong co task nao theo bo loc hien tai.");
    return;
  }
  const iso = new Date().toISOString();
  rows.forEach((task) => {
    task.status = status;
    if (status === "sent" && !task.sentAt) task.sentAt = iso;
    if ((status === "replying" || status === "done") && !task.repliedAt) task.repliedAt = iso;
    task.updatedAt = Date.now();
  });
  saveState();
  renderSummary();
  renderTasks();
}

function quickSetFollowup(taskId, mode) {
  const campaignId = state.activeCampaignId;
  const tasks = state.tasksByCampaign[campaignId] || [];
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;

  const addHours = mode === "plus24h" ? 24 : 48;
  task.followUpAt = Date.now() + addHours * 60 * 60 * 1000;
  task.updatedAt = Date.now();
  saveState();
  renderSummary();
  renderTasks();
}

function truncateText(text, max = 48) {
  const s = String(text || "");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function cleanDisplayGroupName(name) {
  let s = String(name || "").trim();
  if (!s) return "Nhóm";
  s = s.replace(/^\d+\+*/, "");
  const previewCut = s.match(/^(.+?)(?:\d{1,2}:\d{2}|\d+\s*(?:giờ|phút|ngày|tuần|tháng)\b)/iu);
  if (previewCut?.[1]) s = previewCut[1].trim();
  const colonCut = s.match(/^([^:]{4,80}):\s*.+$/);
  if (colonCut?.[1] && /(?:ảnh|video|sticker|file|tin nhắn)/iu.test(s)) {
    s = colonCut[1].trim();
  }
  return s.replace(/\s{2,}/g, " ").trim() || String(name).trim() || "Nhóm";
}

function groupNameInitial(name) {
  const clean = cleanDisplayGroupName(name);
  const ch = clean.replace(/^[^A-Za-zÀ-ỹ0-9]+/, "").charAt(0);
  return (ch || "N").toUpperCase();
}

function labelStatus(status) {
  const map = {
    pending: "Chưa gửi",
    sent: "Đã gửi",
    replying: "Đang trả lời",
    done: "Hoàn tất",
  };
  return map[status] || status;
}

function labelPriority(priority) {
  const map = {
    hot: "Nóng",
    warm: "Ấm",
    cold: "Lạnh",
  };
  return map[priority] || priority;
}

function renderTaskCard(task, group) {
  const overdue = isOverdue(task.followUpAt) && task.status !== "done";
  const disabled = state.role === "responder" ? "disabled" : "";
  const displayName = group ? cleanDisplayGroupName(group.name) : "Nhóm đã xóa";
  const rawName = group?.name || "";
  const status = task.status || "pending";
  const priority = task.priority || "warm";
  const msgPreview = String(task.message || "").trim();
  const composeSummary = msgPreview
    ? truncateText(msgPreview.replace(/\s+/g, " "), 72)
    : "Soạn nội dung tin gửi cho nhóm này…";
  const assigneeLabel = task.assignee?.trim() || group?.owner?.trim() || "Chưa gán";
  return `
    <article class="task-card task-card--${status}${overdue ? " task-card--overdue" : ""}" data-task-id="${task.id}">
      <div class="task-card-top">
        <div class="task-card-avatar" aria-hidden="true">${escapeHtml(groupNameInitial(rawName))}</div>
        <div class="task-card-info">
          <h3 class="task-card-name" title="${escapeHtml(rawName)}">${escapeHtml(truncateText(displayName, 42))}</h3>
          <div class="task-card-meta">
            <span class="task-meta-chip">${escapeHtml(assigneeLabel)}</span>
            ${overdue ? '<span class="task-meta-chip task-meta-chip--danger">Quá hạn</span>' : ""}
            ${msgPreview ? '<span class="task-meta-chip task-meta-chip--ok">Đã soạn tin</span>' : ""}
            ${taskHasAttachments(task) ? `<span class="task-meta-chip">${normalizeTaskAttachments(task).attachments.length} file</span>` : ""}
          </div>
        </div>
        <div class="task-card-controls">
          <select class="task-status-select task-status-select--${status}" data-field="status" data-id="${task.id}">
            <option value="pending" ${status === "pending" ? "selected" : ""}>Chưa gửi</option>
            <option value="sent" ${status === "sent" ? "selected" : ""}>Đã gửi</option>
            <option value="replying" ${status === "replying" ? "selected" : ""}>Đang trả lời</option>
            <option value="done" ${status === "done" ? "selected" : ""}>Hoàn tất</option>
          </select>
          <select class="task-priority-select task-priority-select--${priority}" data-field="priority" data-id="${task.id}" ${disabled}>
            <option value="hot" ${priority === "hot" ? "selected" : ""}>Nóng</option>
            <option value="warm" ${priority === "warm" ? "selected" : ""}>Ấm</option>
            <option value="cold" ${priority === "cold" ? "selected" : ""}>Lạnh</option>
          </select>
        </div>
      </div>
      ${group ? `<div class="task-card-toolbar">${zaloGroupActionsHtml(group, task)}</div>` : ""}
      <details class="task-card-compose"${msgPreview ? " open" : ""}>
        <summary class="task-compose-summary">${escapeHtml(composeSummary)}</summary>
        <textarea data-field="message" data-id="${task.id}" rows="2" placeholder="Nhập nội dung tin nhắn..." ${disabled}>${escapeHtml(task.message)}</textarea>
      </details>
      <details class="task-card-more">
        <summary>Chi tiết · follow-up · ghi chú</summary>
        <div class="task-card-grid">
          <label class="field-compact">
            <span>Người xử lý</span>
            <input data-field="assignee" data-id="${task.id}" placeholder="Tên nhân viên" value="${escapeHtml(task.assignee)}" ${disabled} />
          </label>
          <div class="field-compact field-compact--full attachment-field">
            <span>File đính kèm (ảnh, PDF, Excel, XML…)</span>
            ${renderAttachmentChipsHtml(normalizeTaskAttachments(task).attachments, { taskId: task.id, disabled: Boolean(disabled) })}
            ${
              disabled
                ? ""
                : typeof planHasFeature === "function" && !planHasFeature("attachments")
                  ? `<p class="item-meta attachment-hint plan-locked-hint">🔒 Gói Pro (600k) trở lên mới upload file. <a href="/pricing.html" target="_blank" rel="noopener">Xem bảng giá</a></p>`
                  : `<label class="attachment-upload-btn secondary mini">+ Thêm file
              <input type="file" class="hidden-file-input" data-task-attachment-input="${task.id}" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.xls,.xlsx,.csv,.xml,.doc,.docx,.txt,.zip,image/*" multiple />
            </label>
            <p class="item-meta attachment-hint">File lưu trên CRM — gửi kèm tay trên Zalo Web/PC.</p>`
            }
          </div>
          <label class="field-compact">
            <span>Điểm lead</span>
            <input type="number" min="0" max="100" data-field="leadScore" data-id="${task.id}" value="${Number(task.leadScore || 0)}" ${disabled} />
          </label>
          <label class="field-compact field-compact--wide">
            <span>Follow-up</span>
            <input type="datetime-local" data-field="followUpAt" data-id="${task.id}" value="${toDateTimeLocal(task.followUpAt)}" ${disabled} />
          </label>
          <label class="field-compact field-compact--wide">
            <span>Liên hệ gần nhất</span>
            <input type="datetime-local" data-field="lastContactAt" data-id="${task.id}" value="${toDateTimeLocal(task.lastContactAt)}" ${disabled} />
          </label>
          <div class="field-compact field-compact--wide task-quick-row">
            <span class="field-label-inline">Nhắc nhanh</span>
            <button type="button" class="secondary mini" data-quick="plus24h" data-id="${task.id}" ${disabled}>+24h</button>
            <button type="button" class="secondary mini" data-quick="plus48h" data-id="${task.id}" ${disabled}>+48h</button>
          </div>
          <label class="field-compact field-compact--full">
            <span>Ghi chú</span>
            <textarea data-field="note" data-id="${task.id}" rows="2" placeholder="Ghi chú nội bộ..." ${disabled}>${escapeHtml(task.note || "")}</textarea>
          </label>
        </div>
        <p class="task-card-updated">Cập nhật: ${new Date(task.updatedAt).toLocaleString("vi-VN")}</p>
      </details>
    </article>
  `;
}

function autoPriorityFromScore(score) {
  if (score >= 75) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

function passFollowupFilter(task, filter) {
  if (filter === "all") return true;
  const followupTs = toTimestamp(task.followUpAt);
  if (filter === "none") return !followupTs;
  if (!followupTs) return false;

  if (filter === "overdue") {
    return isOverdue(followupTs);
  }
  if (filter === "today") {
    const now = new Date();
    const target = new Date(followupTs);
    return (
      now.getFullYear() === target.getFullYear() &&
      now.getMonth() === target.getMonth() &&
      now.getDate() === target.getDate()
    );
  }
  return true;
}

function isOverdue(value) {
  const ts = toTimestamp(value);
  return ts && ts < Date.now();
}

function toTimestamp(value) {
  if (!value) return 0;
  const num = Number(value);
  if (!Number.isNaN(num) && num > 0) return num;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toDateTimeLocal(value) {
  const ts = toTimestamp(value);
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function fromDateTimeLocal(value) {
  if (!value) return "";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "";
  return parsed;
}

function exportActiveCampaignCsv() {
  const campaignId = state.activeCampaignId;
  if (!campaignId) {
    alert("Hay chon chien dich truoc khi export.");
    return;
  }
  const campaign = state.campaigns.find((c) => c.id === campaignId);
  const tasks = getFilteredTasks(campaignId);
  const rows = tasks.map((task) => {
    const group = state.groups.find((g) => g.id === task.groupId);
    return [
      group?.name || "",
      task.assignee || "",
      labelPriority(task.priority || "warm"),
      String(task.leadScore ?? ""),
      labelStatus(task.status || "pending"),
      formatDate(task.lastContactAt),
      formatDate(task.followUpAt),
      (task.message || "").replaceAll("\n", " "),
      (task.note || "").replaceAll("\n", " "),
    ];
  });

  const header = [
    "Nhom",
    "Nguoi xu ly",
    "Do nong",
    "Diem lead",
    "Trang thai",
    "Lan lien he gan nhat",
    "Lich follow-up",
    "Noi dung tin",
    "Ghi chu",
  ];

  const csv = [header, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(campaign?.name || "campaign")}_tasks.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDate(value) {
  const ts = toTimestamp(value);
  if (!ts) return "";
  return new Date(ts).toLocaleString();
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
