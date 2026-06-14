let teamUsersCache = null;

async function loadTeamUsers() {
  if (window.currentUserRole !== "admin") return null;
  try {
    const res = await apiFetch("/api/users");
    if (!res.ok) return null;
    teamUsersCache = await res.json();
    window.isPlatformAdmin = Boolean(teamUsersCache?.isPlatformAdmin);
    return teamUsersCache;
  } catch {
    return null;
  }
}

function roleLabel(role) {
  const map = { admin: "Quản trị", editor: "Người soạn tin", responder: "Người trả lời" };
  return map[role] || role;
}

function renderTeamUsersPanel() {
  const panel = document.getElementById("team-users-panel");
  if (!panel) return;

  if (window.currentUserRole !== "admin") {
    panel.innerHTML = `
      <p class="item-meta">Chỉ <strong>admin</strong> mới quản lý tài khoản team. Liên hệ quản trị nếu cần thêm user.</p>
    `;
    return;
  }

  const data = teamUsersCache;
  const usage = data?.usage;
  const plan = data?.plan;
  const isPlatform = Boolean(data?.isPlatformAdmin);
  const teamUsers = data?.users || [];
  const allAccounts = data?.customers || [];

  const usersRemaining =
    data?.limits?.usersRemaining ??
    Math.max(0, (plan?.maxUsers ?? 0) - (usage?.users ?? teamUsers.length));
  const isFreePlan = plan?.id === "free";
  const canAddTeamUser = usersRemaining > 0;

  const listSection = isPlatform
    ? `
      <p class="item-meta team-users-limit">
        <strong>Quản trị hệ thống</strong> — xem &amp; quản lý <strong>${allAccounts.length} khách</strong> đăng ký (email).
      </p>
      ${renderAccountsTable(allAccounts, { showWorkspace: true, showPlan: true, fullActions: true })}
      <h3 class="team-section-title">Team workspace của bạn</h3>
      <p class="item-meta">Nhân viên trong workspace quản trị (không phải khách đăng ký).</p>
      ${renderAccountsTable(
        teamUsers.map((u) => ({
          ...u,
          workspaceId: null,
          plan: null,
          trial: null,
          usage: null,
        })),
        { showWorkspace: false, showPlan: false, fullActions: false },
      )}
    `
    : `
      <div class="team-users-help">
        <p><strong>2 loại tài khoản</strong></p>
        <ul>
          <li><strong>Chủ workspace (bạn):</strong> đăng ký bằng <strong>email</strong> → đăng nhập tại <a href="/login.html">/login.html</a> bằng email + mật khẩu.</li>
          <li><strong>Nhân viên (tùy chọn):</strong> admin tạo <strong>username</strong> (không có email) → nhân viên đăng nhập cùng trang <a href="/login.html">/login.html</a> bằng <strong>username + mật khẩu</strong>.</li>
        </ul>
      </div>
      <p class="item-meta team-users-limit">
        Team của bạn: <strong>${teamUsers.length}/${plan?.maxUsers ?? "?"}</strong> user CRM
        ${isFreePlan ? " · gói FREE chỉ dùng một mình, không thêm nhân viên" : ""}.
      </p>
      ${renderAccountsTable(
        teamUsers.map((u) => ({
          ...u,
          workspaceId: null,
          plan: null,
          trial: null,
          usage: null,
        })),
        { showWorkspace: false, showPlan: false, fullActions: false },
      )}
    `;

  const addUserSection = canAddTeamUser
    ? `
    <h3 class="team-section-title">Thêm nhân viên vào team</h3>
    <p class="item-meta">
      Gói ${escapeHtml(plan?.name || "—")} · còn <strong>${usersRemaining}</strong> slot.
      Nhân viên đăng nhập tại <a href="/login.html">trang đăng nhập</a> bằng username (vd. <code>sale_lan</code>) + mật khẩu bạn đặt.
    </p>
    <form id="team-user-form" class="stack team-user-form">
      <div class="team-user-form-row">
        <label>Username <input id="team-user-username" placeholder="sale_lan" required autocomplete="off" /></label>
        <label>Mật khẩu <input id="team-user-password" type="password" placeholder="Tối thiểu 6 ký tự" required autocomplete="new-password" /></label>
        <label>Vai trò
          <select id="team-user-role">
            <option value="editor">Người soạn tin</option>
            <option value="responder">Người trả lời</option>
            <option value="admin">Quản trị</option>
          </select>
        </label>
        <button type="submit" id="team-user-submit">Tạo nhân viên</button>
      </div>
      <p id="team-user-form-status" class="item-meta" role="status"></p>
    </form>
  `
    : isPlatform
      ? `
    <div class="team-users-blocked">
      <h3 class="team-section-title">Thêm nhân viên team bạn</h3>
      <p class="item-meta">Quản trị hệ thống quản lý khách ở bảng trên. Thêm nhân viên cho workspace của bạn tại đây (nếu gói còn slot).</p>
    </div>
  `
      : `
    <div class="team-users-blocked">
      <h3 class="team-section-title">Thêm nhân viên</h3>
      <p class="item-meta">
        ${
          isFreePlan
            ? "Gói <strong>FREE</strong> chỉ có <strong>1 user</strong> — chính tài khoản email bạn đã đăng ký. Không tạo thêm user được."
            : `Đã đủ <strong>${plan?.maxUsers ?? "?"}</strong> user theo gói ${escapeHtml(plan?.name || "—")}.`
        }
        Nâng lên <a href="/pricing.html">Cơ bản 300k</a> (2 user) hoặc cao hơn để thêm nhân viên soạn tin / trả lời inbox.
      </p>
    </div>
  `;

  panel.innerHTML = `
    ${listSection}
    ${addUserSection}
  `;

  bindAccountTableEvents(panel, isPlatform);

  const pageSub = document.getElementById("users-page-subtitle");
  if (pageSub) {
    pageSub.textContent = isPlatform
      ? "Quản trị hệ thống — khách đăng ký · team workspace của bạn"
      : "Quản lý team workspace · gói FREE = 1 người (email đăng ký)";
  }

  document.getElementById("team-user-form")?.addEventListener("submit", handleTeamUserCreate);
}

function renderAccountsTable(accounts, { showWorkspace, showPlan, fullActions }) {
  const rows =
    accounts
      .map((c) => {
        const verify = c.emailVerified
          ? '<span class="team-user-verified">OK</span>'
          : c.email
            ? '<span class="team-user-pending">Chưa</span>'
            : "—";
        const trial =
          c.trial?.isTrial && fullActions
            ? c.trial.expired
              ? '<span class="team-user-pending">Hết FREE</span>'
              : `<span class="team-user-verified">FREE ~${c.trial.hoursLeft ?? "?"}h</span>`
            : "—";
        const isSelf = c.isSelf ? ' <span class="team-user-self">(bạn)</span>' : "";
        const planCell = showPlan
          ? `<select class="team-user-plan" data-account-plan="${escapeHtml(c.id)}">${["free", "basic", "pro", "vip"]
              .map(
                (id) =>
                  `<option value="${id}" ${c.plan?.id === id ? "selected" : ""}>${{ free: "FREE", basic: "300k", pro: "600k", vip: "900k" }[id]}</option>`,
              )
              .join("")}</select>`
          : escapeHtml(c.roleLabel || roleLabel(c.role));
        const roleSelect =
          c.isSelf || !fullActions
            ? escapeHtml(c.roleLabel || roleLabel(c.role))
            : `<select class="team-user-role" data-account-role="${escapeHtml(c.id)}">
              <option value="admin" ${c.role === "admin" ? "selected" : ""}>Quản trị</option>
              <option value="editor" ${c.role === "editor" ? "selected" : ""}>Người soạn tin</option>
              <option value="responder" ${c.role === "responder" ? "selected" : ""}>Người trả lời</option>
            </select>`;
        const actions = c.isSelf
          ? `<span class="item-meta">—</span>`
          : `${fullActions && !c.emailVerified && c.email ? `<button type="button" class="secondary mini" data-verify-account="${escapeHtml(c.id)}">Xác minh</button>` : ""}
             <button type="button" class="secondary mini" data-reset-account="${escapeHtml(c.id)}">Đổi MK</button>
             <button type="button" class="secondary mini team-user-delete" data-delete-account="${escapeHtml(c.id)}">Xóa TK</button>`;

        return `
      <tr data-user-row="${escapeHtml(c.id)}">
        <td>${c.email ? escapeHtml(c.email) : '<span class="item-meta">—</span>'}${isSelf}</td>
        <td><code>${escapeHtml(c.username)}</code></td>
        ${showWorkspace ? `<td><code>${escapeHtml(c.workspaceId || c.username)}</code></td>` : ""}
        <td>${planCell}</td>
        ${fullActions ? `<td>${c.usage?.groups ?? 0}</td><td>${verify}</td><td>${trial}</td>` : ""}
        <td>${roleSelect}</td>
        <td class="team-user-actions">${actions}</td>
      </tr>`;
      })
      .join("") || `<tr><td colspan="8" class="item-meta">Chưa có user.</td></tr>`;

  return `
    <div class="table-scroll">
      <table class="compare-table team-users-table customers-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Username</th>
            ${showWorkspace ? "<th>Workspace</th>" : ""}
            <th>${showPlan ? "Gói" : "Vai trò"}</th>
            ${fullActions ? "<th>Nhóm</th><th>Xác minh</th><th>Trial</th>" : ""}
            ${fullActions ? "<th>Vai trò</th>" : ""}
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function bindAccountTableEvents(panel, isPlatform) {
  panel.querySelectorAll("[data-delete-account]").forEach((btn) => {
    btn.addEventListener("click", () => deleteTeamUser(btn.getAttribute("data-delete-account")));
  });
  panel.querySelectorAll("[data-reset-account]").forEach((btn) => {
    btn.addEventListener("click", () => resetTeamUserPassword(btn.getAttribute("data-reset-account")));
  });
  panel.querySelectorAll("[data-account-role]").forEach((sel) => {
    sel.addEventListener("change", () => updateTeamUserRole(sel.getAttribute("data-account-role"), sel.value));
  });
  if (isPlatform) {
    panel.querySelectorAll("[data-account-plan]").forEach((sel) => {
      sel.addEventListener("change", () => updateAccountPlan(sel.getAttribute("data-account-plan"), sel.value));
    });
    panel.querySelectorAll("[data-verify-account]").forEach((btn) => {
      btn.addEventListener("click", () => verifyAccountEmail(btn.getAttribute("data-verify-account")));
    });
  }
}

async function updateAccountPlan(userId, planId) {
  const res = await apiFetch(`/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan: planId }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.error || "Không đổi được gói.");
    await refreshTeamUsersPanel();
    return;
  }
  await refreshTeamUsersPanel();
}

async function verifyAccountEmail(userId) {
  const row = findAccountRow(userId);
  const label = row?.email || row?.username || "user";
  if (!confirm(`Xác minh email cho «${label}»?`)) return;
  const res = await apiFetch(`/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailVerified: true }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.error || "Không xác minh được.");
    return;
  }
  await refreshTeamUsersPanel();
}

function findAccountRow(userId) {
  return (
    teamUsersCache?.customers?.find((u) => u.id === userId) ||
    teamUsersCache?.users?.find((u) => u.id === userId)
  );
}

async function handleTeamUserCreate(e) {
  e.preventDefault();
  const status = document.getElementById("team-user-form-status");
  const username = document.getElementById("team-user-username")?.value.trim();
  const password = document.getElementById("team-user-password")?.value || "";
  const role = document.getElementById("team-user-role")?.value || "editor";

  try {
    const res = await apiFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (status) status.textContent = payload.error || "Không tạo được user.";
      if (payload.code === "PLAN_LIMIT_USERS" && typeof notifyPlanBlocked === "function") {
        notifyPlanBlocked("users");
      }
      return;
    }
    if (status) status.textContent = `Đã tạo user «${payload.user.username}» (${payload.user.roleLabel}).`;
    document.getElementById("team-user-form")?.reset();
    await refreshTeamUsersPanel();
    if (typeof loadPlanSnapshot === "function") {
      await loadPlanSnapshot();
      applyPlanUi();
    }
  } catch {
    if (status) status.textContent = "Lỗi mạng.";
  }
}

async function deleteTeamUser(userId) {
  const row = findAccountRow(userId);
  const label = row?.email || row?.username || "user";
  if (!row || !confirm(`Xóa tài khoản «${label}»? Không hoàn tác được.`)) return;
  const res = await apiFetch(`/api/users/${userId}`, { method: "DELETE" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.error || "Không xóa được user.");
    return;
  }
  await refreshTeamUsersPanel();
  if (typeof loadPlanSnapshot === "function") {
    await loadPlanSnapshot();
    applyPlanUi();
  }
}

async function resetTeamUserPassword(userId) {
  const row = findAccountRow(userId);
  const password = prompt(`Mật khẩu mới cho «${row?.email || row?.username || "user"}» (tối thiểu 6 ký tự):`);
  if (!password) return;
  const res = await apiFetch(`/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.error || "Không đổi được mật khẩu.");
    return;
  }
  alert(`Đã đổi mật khẩu cho «${row?.email || row?.username}».`);
}

async function updateTeamUserRole(userId, role) {
  const res = await apiFetch(`/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.error || "Không đổi được vai trò.");
    await refreshTeamUsersPanel();
    return;
  }
  await refreshTeamUsersPanel();
}

async function refreshTeamUsersPanel() {
  await loadTeamUsers();
  renderTeamUsersPanel();
  renderAdminDashboardStrip();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function initTeamUsersPanel() {
  await loadTeamUsers();
  renderTeamUsersPanel();
  renderAdminDashboardStrip();
}

function renderAdminDashboardStrip() {
  const strip = document.getElementById("admin-dashboard-strip");
  const cards = document.getElementById("admin-dashboard-cards");
  if (!strip || !cards) return;

  if (window.currentUserRole !== "admin") {
    strip.classList.add("hidden");
    return;
  }

  strip.classList.remove("hidden");
  const data = teamUsersCache;
  const isPlatform = Boolean(data?.isPlatformAdmin);
  const teamUsers = data?.users || [];
  const allAccounts = data?.customers || [];
  const plan = data?.plan || planSnapshot?.plan;
  const usage = data?.usage || planSnapshot?.usage;

  cards.innerHTML = isPlatform
    ? `
    <article class="summary-card summary-card--rose summary-card--compact">
      <h3>${allAccounts.length}</h3>
      <p>Khách hệ thống</p>
    </article>
    <article class="summary-card summary-card--blue summary-card--compact">
      <h3>${usage?.users ?? teamUsers.length} / ${plan?.maxUsers ?? "—"}</h3>
      <p>Team bạn</p>
    </article>
    <article class="summary-card summary-card--green summary-card--compact">
      <h3>${escapeHtml(plan?.name || "—")}</h3>
      <p>Gói của bạn</p>
    </article>
  `
    : `
    <article class="summary-card summary-card--blue summary-card--compact">
      <h3>${usage?.users ?? teamUsers.length} / ${plan?.maxUsers ?? "—"}</h3>
      <p>User team</p>
    </article>
    <article class="summary-card summary-card--green summary-card--compact">
      <h3>${escapeHtml(plan?.name || "—")}</h3>
      <p>Gói dịch vụ</p>
    </article>
    <article class="summary-card summary-card--indigo summary-card--compact">
      <h3>${usage?.groups ?? 0} / ${plan?.maxGroups ?? "—"}</h3>
      <p>Nhóm Zalo</p>
    </article>
  `;
}
