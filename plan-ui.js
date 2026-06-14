/** @type {null | { plan: object, usage: object, limits: object, upgradeUrl: string }} */
let planSnapshot = null;

async function loadPlanSnapshot() {
  if (!getAccessToken()) return null;
  try {
    const res = await apiFetch("/api/plan");
    if (res.status === 401) return null;
    if (!res.ok) return null;
    planSnapshot = await res.json();
    return planSnapshot;
  } catch {
    return null;
  }
}

function getPlanSnapshot() {
  return planSnapshot;
}

function currentPlanId() {
  return planSnapshot?.plan?.id || "free";
}

function planHasFeature(feature) {
  return planSnapshot?.plan?.features?.[feature] !== false;
}

function canAddGroups(count = 1) {
  const remaining = planSnapshot?.limits?.groupsRemaining ?? 0;
  return remaining >= count;
}

function planUpgradeMessage(feature) {
  const names = {
    broadcast: "Thông báo hàng loạt (Broadcast)",
    attachments: "File đính kèm",
    multiZalo: "Nhiều tài khoản Zalo Web",
    groups: "Thêm nhóm Zalo",
    users: "Thêm user CRM",
  };
  const label = names[feature] || feature;
  const planName = planSnapshot?.plan?.name || "Cơ bản";
  return `Gói ${planName} chưa mở «${label}». Nâng lên Pro (600k) hoặc VIP (900k).\n\nXem bảng giá: ${planSnapshot?.upgradeUrl || "/pricing.html"}`;
}

function notifyPlanBlocked(feature) {
  if (confirm(`${planUpgradeMessage(feature)}\n\nMở trang bảng giá?`)) {
    window.open(planSnapshot?.upgradeUrl || "/pricing.html", "_blank", "noopener");
  }
}

function renderPlanBadge() {
  const el = document.getElementById("plan-badge");
  if (!el || !planSnapshot?.plan) return;
  const { plan, usage, trial } = planSnapshot;
  el.className = `plan-badge plan-badge--${plan.id}`;
  const trialMeta =
    trial?.isTrial && trial.active && trial.hoursLeft != null
      ? ` · còn ~${trial.hoursLeft}h`
      : trial?.pendingStart
        ? " · chờ xác minh email"
        : "";
  el.innerHTML = `
    <span class="plan-badge-name">${escapeHtml(plan.name)}</span>
    <span class="plan-badge-meta">${usage.groups}/${plan.maxGroups} nhóm${trialMeta}</span>
  `;
  el.title = `${plan.priceLabel} · ${usage.groups}/${plan.maxGroups} nhóm · ${usage.users}/${plan.maxUsers} user`;
}

function renderTrialTopBanner() {
  const banner = document.getElementById("trial-top-banner");
  if (!banner || !planSnapshot?.trial) return;
  const { trial, plan } = planSnapshot;

  if (!trial.isTrial) {
    banner.classList.add("hidden");
    banner.innerHTML = "";
    return;
  }

  if (trial.expired) {
    banner.classList.remove("hidden");
    banner.className = "trial-top-banner trial-top-banner--expired";
    banner.innerHTML = `
      <strong>Gói FREE đã hết hạn.</strong>
      Nâng lên Cơ bản (300k), Pro (600k) hoặc VIP (900k) để tiếp tục.
      <a href="/pricing.html">Xem bảng giá</a>
    `;
    return;
  }

  banner.classList.remove("hidden");
  banner.className = "trial-top-banner";
  const hours = trial.hoursLeft ?? trial.durationHours ?? 24;
  const limitLine = `Tối đa <strong>${plan.maxGroups} nhóm</strong> · 1 user · Gửi Web + công việc · không broadcast/file`;
  if (trial.pendingStart) {
    banner.innerHTML = `
      <strong>FREE 1 ngày</strong> bắt đầu sau khi xác minh email.
      ${limitLine}
    `;
    return;
  }

  banner.innerHTML = `
    <strong>FREE còn ~${hours} giờ</strong> · ${limitLine}
    · <a href="/pricing.html">Nâng gói</a>
  `;
}

function renderPlanSettingsPanel() {
  const panel = document.getElementById("plan-settings-panel");
  if (!panel || !planSnapshot) return;

  const { plan, usage, limits } = planSnapshot;
  const isAdmin = window.currentUserRole === "admin";

  const featureRows = [
    ["Gửi Web + Công việc", true],
    ["Inbox tập trung", plan.features.inbox],
    ["Broadcast nhiều nhóm", plan.features.broadcast],
    ["File đính kèm", plan.features.attachments],
    ["Nhiều Zalo Web", plan.features.multiZalo],
  ]
    .map(
      ([label, ok]) =>
        `<li class="${ok ? "included" : "excluded"}">${ok ? "✓" : "🔒"} ${escapeHtml(label)}</li>`,
    )
    .join("");

  panel.innerHTML = `
    <div class="plan-settings-grid">
      <div class="plan-settings-current plan-card plan-card--${plan.id}">
        <div class="plan-settings-head">
          <h3>Gói đang dùng: ${escapeHtml(plan.name)}</h3>
          <p class="plan-price-tag">${escapeHtml(plan.priceLabel)}</p>
        </div>
        <ul class="plan-usage-list">
          <li><strong>Nhóm Zalo:</strong> ${usage.groups} / ${plan.maxGroups} <span class="item-meta">(còn ${limits.groupsRemaining})</span></li>
          <li><strong>User CRM:</strong> ${usage.users} / ${plan.maxUsers}</li>
          <li><strong>Tài khoản Zalo Web:</strong> ${usage.zaloAccounts} / ${plan.maxZaloAccounts}</li>
        </ul>
        <ul class="plan-feature-list">${featureRows}</ul>
        <a href="/pricing.html" target="_blank" rel="noopener" class="secondary landing-btn plan-upgrade-link">Xem bảng giá · nâng gói</a>
      </div>
      ${
        isAdmin && planSnapshot?.canChangePlan
          ? `<div class="plan-settings-admin">
        <h4>Đổi gói (demo / quản trị hệ thống)</h4>
        <p class="item-meta">Khách thật: liên hệ nhà cung cấp để nâng gói. Chỉ bật khi ALLOW_SELF_PLAN_CHANGE=true hoặc đăng nhập quản trị hệ thống.</p>
        <div class="plan-switch-row">
          ${["basic", "pro", "vip"]
            .map((id) => {
              const labels = { basic: "Cơ bản 300k", pro: "Pro 600k", vip: "VIP 900k" };
              const active = plan.id === id ? "active" : "";
              return `<button type="button" class="secondary mini plan-switch-btn ${active}" data-plan-switch="${id}">${labels[id]}</button>`;
            })
            .join("")}
        </div>
        <p id="plan-switch-status" class="item-meta" role="status"></p>
      </div>`
          : `<p class="item-meta plan-settings-note">${
              isAdmin
                ? "Không thể tự đổi gói trên web. Liên hệ quản trị hệ thống hoặc xem bảng giá."
                : "Chỉ admin mới đổi gói. Liên hệ quản trị để nâng Pro/VIP."
            }</p>`
      }
    </div>
  `;

  panel.querySelectorAll("[data-plan-switch]").forEach((btn) => {
    btn.addEventListener("click", () => switchSubscriptionPlan(btn.getAttribute("data-plan-switch")));
  });
}

async function switchSubscriptionPlan(planId) {
  const status = document.getElementById("plan-switch-status");
  try {
    const res = await apiFetch("/api/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: planId }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (status) status.textContent = payload.error || "Không đổi được gói";
      alert(payload.error || payload.message || "Không đổi được gói");
      return;
    }
    planSnapshot = payload;
    if (status) status.textContent = `Đã chuyển sang gói ${payload.plan.name}.`;
    if (typeof window.onPlanChanged === "function") window.onPlanChanged();
  } catch {
    if (status) status.textContent = "Lỗi mạng khi đổi gói.";
  }
}

function applyPlanNavLocks() {
  const broadcastBtn = document.querySelector('.app-nav-item[data-view="broadcast"]');
  if (broadcastBtn) {
    broadcastBtn.classList.toggle("app-nav-item--locked", !planHasFeature("broadcast"));
    broadcastBtn.dataset.planLocked = planHasFeature("broadcast") ? "0" : "1";
  }
}

function renderBroadcastPlanLock() {
  const lock = document.getElementById("broadcast-plan-lock");
  const section = document.getElementById("broadcast-section");
  if (!lock || !section) return;

  const locked = !planHasFeature("broadcast");
  lock.classList.toggle("hidden", !locked);
  section.classList.toggle("plan-locked-section", locked);
  if (locked) {
    lock.innerHTML = `
      <div class="plan-lock-card">
        <span class="plan-lock-icon" aria-hidden="true">🔒</span>
        <h3>Thông báo hàng loạt — gói Pro trở lên</h3>
        <p>Gói ${escapeHtml(planSnapshot?.plan?.name || "Cơ bản")} (300k) chưa mở broadcast. Nâng <strong>Pro 600k</strong> để gửi cùng nội dung nhiều nhóm.</p>
        <div class="plan-lock-actions">
          <a href="/pricing.html" target="_blank" rel="noopener" class="btn-primary landing-btn">Xem bảng giá</a>
          ${window.currentUserRole === "admin" ? `<button type="button" class="secondary landing-btn" data-plan-switch-inline="pro">Thử gói Pro (admin)</button>` : ""}
        </div>
      </div>
    `;
    lock.querySelector("[data-plan-switch-inline]")?.addEventListener("click", () => switchSubscriptionPlan("pro"));
  }
}

function renderGroupsPlanBanner() {
  const banner = document.getElementById("groups-plan-banner");
  if (!banner || !planSnapshot) return;
  const { plan, usage, limits } = planSnapshot;
  if (limits.groupsRemaining <= 5) {
    banner.classList.remove("hidden");
    banner.className = limits.groupsRemaining <= 0 ? "plan-banner plan-banner--danger" : "plan-banner plan-banner--warn";
    banner.innerHTML =
      limits.groupsRemaining <= 0
        ? `Đã đạt giới hạn <strong>${plan.maxGroups} nhóm</strong> (gói ${escapeHtml(plan.name)}). <a href="/pricing.html" target="_blank" rel="noopener">Nâng gói Pro</a> để thêm ~300 nhóm.`
        : `Còn <strong>${limits.groupsRemaining}</strong> nhóm trong gói ${escapeHtml(plan.name)} (${usage.groups}/${plan.maxGroups}).`;
  } else {
    banner.classList.add("hidden");
    banner.textContent = "";
  }
}

function updatePlanUsageFromState(state) {
  if (!planSnapshot?.plan || !state) return;
  planSnapshot.usage.groups = (state.groups || []).length;
  planSnapshot.usage.zaloAccounts = (state.zaloAccounts || []).length;
  planSnapshot.usage.broadcasts = (state.broadcasts || []).length;
  planSnapshot.limits.groupsRemaining = Math.max(0, planSnapshot.plan.maxGroups - planSnapshot.usage.groups);
  planSnapshot.limits.zaloAccountsRemaining = Math.max(
    0,
    planSnapshot.plan.maxZaloAccounts - planSnapshot.usage.zaloAccounts,
  );
}

function applyPlanUi() {
  if (typeof state !== "undefined" && window.__crmStateRef) {
    updatePlanUsageFromState(window.__crmStateRef);
  }
  renderPlanBadge();
  renderTrialTopBanner();
  renderPlanSettingsPanel();
  applyPlanNavLocks();
  renderBroadcastPlanLock();
  renderGroupsPlanBanner();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
