chrome.storage.sync.get(["crmBaseUrl", "syncToken", "enabled", "campaignId", "panelHidden"], (stored) => {
  const base =
    typeof resolveCrmBaseUrl === "function"
      ? resolveCrmBaseUrl(stored.crmBaseUrl)
      : stored.crmBaseUrl || "https://crm-alpha-henna-85.vercel.app";
  ZaloCrmSync.saveConfig({
    crmBaseUrl: base,
    syncToken: stored.syncToken || "",
    enabled: stored.enabled !== false,
    campaignId: stored.campaignId || null,
    panelHidden: stored.panelHidden === true,
  });

  const mustSetup = !stored.syncToken;
  ZaloCrmSync.init({
    showPanel: mustSetup,
    onSync(result, chat) {
      const status = document.getElementById("zcs-status");
      if (!status) return;
      if (result.ok) {
        status.textContent = `✓ ${chat.groupName || "Nhóm"} → CRM: Đã gửi`;
        status.style.color = "#16a34a";
      } else {
        status.textContent = result.error || "Không đồng bộ được";
        status.style.color = "#dc2626";
      }
    },
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  const cfg = ZaloCrmSync.loadConfig();
  if (changes.crmBaseUrl) cfg.crmBaseUrl = resolveCrmBaseUrl?.(changes.crmBaseUrl.newValue) || changes.crmBaseUrl.newValue;
  if (changes.syncToken) cfg.syncToken = changes.syncToken.newValue;
  if (changes.enabled) cfg.enabled = changes.enabled.newValue !== false;
  if (changes.campaignId) cfg.campaignId = changes.campaignId.newValue || null;
  if (changes.panelHidden) cfg.panelHidden = changes.panelHidden.newValue === true;
  ZaloCrmSync.saveConfig(cfg);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === "show-panel") {
    ZaloCrmSync.setPanelHidden(false);
    sendResponse({ ok: true });
    return true;
  }
  if (message?.action === "toggle-panel") {
    const open = Boolean(document.getElementById("zalo-crm-sync-panel"));
    ZaloCrmSync.setPanelHidden(open);
    sendResponse({ ok: true, hidden: open });
    return true;
  }
  if (message?.action === "ping") {
    const cfg = ZaloCrmSync.loadConfig();
    const loggedIn = Boolean(
      document.querySelector('.conv-item, [class*="conv-item"], [data-d-name]') ||
        document.querySelector('[class*="chat-list"]'),
    );
    sendResponse({
      ok: true,
      version: "1.7.4",
      hasToken: Boolean(cfg.syncToken),
      loggedIn,
      url: location.href,
    });
    return true;
  }
  if (message?.action === "scan-groups") {
    (async () => {
      const cfg = ZaloCrmSync.loadConfig();
      const groups = await ZaloCrmSync.scanAllGroups({});
      const result = await ZaloCrmSync.pushGroupsScanToCrm(groups, cfg);
      const counts = result.counts || ZaloCrmSync.countChatTypes(groups);
      sendResponse({ ...result, count: groups.length, counts });
    })().catch((e) => sendResponse({ ok: false, error: e.message || "Scan failed" }));
    return true;
  }
  if (message?.action === "auto-send") {
    ZaloCrmSync.autoSendMessage(message.payload || {})
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ ok: false, error: e.message || "Auto send failed" }));
    return true;
  }
  return false;
});
