/**
 * Chạy trên chat.zalo.me — phát hiện gửi tin → báo CRM đánh dấu "Đã gửi".
 * Dùng chung cho Chrome extension và userscript.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ZaloCrmSync = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STORAGE_KEY = "zalo_crm_sync_config";
  const recentKeys = new Map();

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveConfig(config) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  function normalizeName(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function getActiveChatInfo() {
    const activeSelectors = [
      ".conv-item.active",
      ".conv-item.selected",
      '[class*="conv-item"][class*="active"]',
      '[class*="thread-item"][class*="active"]',
      '[aria-selected="true"]',
    ];

    let node = null;
    for (const sel of activeSelectors) {
      node = document.querySelector(sel);
      if (node) break;
    }

    const scope = node || document;
    const nameEl =
      scope.querySelector("[data-d-name]") ||
      scope.closest?.("[data-d-name]") ||
      document.querySelector("[data-d-name].active, [data-d-name][class*='active']");

    const idEl = nameEl || scope;
    const groupName =
      nameEl?.getAttribute("data-d-name") ||
      nameEl?.getAttribute("title") ||
      document.querySelector('[class*="header"] [title]')?.getAttribute("title") ||
      document.querySelector('[class*="chat-info"]')?.textContent?.trim() ||
      "";

    const zaloGroupId =
      idEl?.getAttribute("data-id") ||
      idEl?.getAttribute("data-chatid") ||
      idEl?.getAttribute("data-conv-id") ||
      "";

    return {
      groupName: groupName.replace(/\s+/g, " ").trim().slice(0, 120),
      zaloGroupId: String(zaloGroupId || "").trim(),
    };
  }

  function isSendClick(target) {
    if (!(target instanceof Element)) return false;
    const btn = target.closest(
      'button, [role="button"], [class*="send"], [class*="Send"], [data-id*="send"]',
    );
    if (!btn) return false;
    const label = `${btn.getAttribute("aria-label") || ""} ${btn.className || ""} ${btn.textContent || ""}`.toLowerCase();
    return /send|gửi|gui|submit|paper|plane|arrow/.test(label) || btn.querySelector("svg");
  }

  function isComposeEnter(event) {
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    if (target.tagName === "TEXTAREA") return true;
    if (target.isContentEditable) return true;
    return Boolean(target.closest('[contenteditable="true"], [class*="input"], [class*="editor"], [class*="compose"]'));
  }

  function shouldSkipDuplicate(key) {
    const now = Date.now();
    const last = recentKeys.get(key) || 0;
    if (now - last < 4000) return true;
    recentKeys.set(key, now);
    return false;
  }

  async function notifyCrmSent(chatInfo, config) {
    const cfg = config || loadConfig();
    const crmBase = (cfg.crmBaseUrl || "http://localhost:3000").replace(/\/$/, "");
    const syncToken = cfg.syncToken || "";
    if (!syncToken) {
      return { ok: false, error: "Chưa cấu hình mã đồng bộ CRM" };
    }

    const body = {
      groupName: chatInfo.groupName,
      zaloGroupId: chatInfo.zaloGroupId,
      campaignId: cfg.campaignId || null,
      source: "zalo-web",
    };

    const response = await fetch(`${crmBase}/api/sync/zalo-sent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Zalo-Sync-Token": syncToken,
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: payload.error || "CRM sync failed", payload };
    }
    return { ok: true, payload };
  }

  async function handleSendEvent() {
    const config = loadConfig();
    if (config.enabled === false) return null;

    const chat = getActiveChatInfo();
    if (!chat.groupName && !chat.zaloGroupId) return null;

    const dedupeKey = `${normalizeName(chat.groupName)}|${chat.zaloGroupId}`;
    if (shouldSkipDuplicate(dedupeKey)) return null;

    const result = await notifyCrmSent(chat, config);
    if (typeof config.onSync === "function") {
      config.onSync(result, chat);
    }
    return result;
  }

  function bindSendListeners() {
    document.addEventListener(
      "click",
      (event) => {
        if (!isSendClick(event.target)) return;
        setTimeout(() => {
          handleSendEvent().catch(() => {});
        }, 350);
      },
      true,
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (!isComposeEnter(event)) return;
        setTimeout(() => {
          handleSendEvent().catch(() => {});
        }, 350);
      },
      true,
    );
  }

  function renderPanel(options = {}) {
    const panelId = "zalo-crm-sync-panel";
    let panel = document.getElementById(panelId);
    if (panel) panel.remove();

    const cfg = { ...loadConfig(), ...options };
    panel = document.createElement("div");
    panel.id = panelId;
    panel.style.cssText =
      "position:fixed;bottom:16px;left:16px;z-index:99999;background:#fff;border:1px solid #cbd5e1;padding:12px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);font:13px Inter,sans-serif;max-width:300px;";

    panel.innerHTML = `
      <strong style="display:block;margin-bottom:6px">Zalo CRM · Tự đánh dấu đã gửi</strong>
      <label style="display:block;font-size:11px;color:#64748b;margin-bottom:4px">URL CRM</label>
      <input id="zcs-crm-url" style="width:100%;margin-bottom:8px;padding:6px;box-sizing:border-box" value="${cfg.crmBaseUrl || "http://localhost:3000"}" />
      <label style="display:block;font-size:11px;color:#64748b;margin-bottom:4px">Mã đồng bộ (copy từ CRM)</label>
      <input id="zcs-token" style="width:100%;margin-bottom:8px;padding:6px;box-sizing:border-box" value="${cfg.syncToken || ""}" placeholder="dán mã..." />
      <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:12px">
        <input type="checkbox" id="zcs-enabled" ${cfg.enabled !== false ? "checked" : ""} /> Bật tự cập nhật khi gửi tin
      </label>
      <button id="zcs-save" style="padding:6px 10px;margin-right:6px;cursor:pointer">Lưu</button>
      <span id="zcs-status" style="font-size:11px;color:#64748b"></span>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#zcs-save").onclick = () => {
      const next = {
        crmBaseUrl: panel.querySelector("#zcs-crm-url").value.trim() || "http://localhost:3000",
        syncToken: panel.querySelector("#zcs-token").value.trim(),
        enabled: panel.querySelector("#zcs-enabled").checked,
        campaignId: cfg.campaignId || null,
      };
      saveConfig(next);
      panel.querySelector("#zcs-status").textContent = "Đã lưu — gửi tin thử trên Zalo.";
    };
  }

  function init(options = {}) {
    if (options.crmBaseUrl || options.syncToken) {
      saveConfig({ ...loadConfig(), ...options });
    }
    bindSendListeners();
    if (options.showPanel !== false) {
      renderPanel(options);
    }
    return {
      getActiveChatInfo,
      handleSendEvent,
      notifyCrmSent,
      loadConfig,
      saveConfig,
    };
  }

  return {
    init,
    getActiveChatInfo,
    handleSendEvent,
    notifyCrmSent,
    loadConfig,
    saveConfig,
    bindSendListeners,
    renderPanel,
  };
});
