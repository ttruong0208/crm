function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitTabComplete(tabId, maxMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.status === "complete") return tab;
    await sleep(400);
  }
  return chrome.tabs.get(tabId).catch(() => null);
}

async function pingZaloTab(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: "ping" });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

async function ensureZaloScripts(tabId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (await pingZaloTab(tabId)) return true;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["zalo-sync-core.js", "content.js"],
      });
    } catch {
      /* tab chưa sẵn sàng */
    }
    await sleep(1000 + attempt * 400);
  }
  return pingZaloTab(tabId);
}

async function getZaloTab() {
  const tabs = await chrome.tabs.query({ url: ["https://chat.zalo.me/*"] });
  return tabs[0] || null;
}

async function getActiveCrmOrOtherTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || tab.url?.includes("chat.zalo.me")) return null;
  return tab;
}

async function restoreActiveTab(tab) {
  if (!tab?.id) return;
  try {
    await chrome.tabs.update(tab.id, { active: true });
  } catch {
    /* tab đã đóng */
  }
}

async function getOrCreateZaloTab(options = {}) {
  const silent = options.silent !== false;
  let tab = await getZaloTab();
  if (!tab) {
    tab = await chrome.tabs.create({
      url: "https://chat.zalo.me/",
      active: !silent,
    });
    await waitTabComplete(tab.id);
    await ensureZaloScripts(tab.id);
    return tab;
  }
  if (!silent) {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
  }
  if (!tab.url?.includes("chat.zalo.me")) {
    await chrome.tabs.update(tab.id, { url: "https://chat.zalo.me/" });
    await waitTabComplete(tab.id);
  }
  await ensureZaloScripts(tab.id);
  return tab;
}

async function focusZaloTab(tab) {
  if (!tab?.id) return;
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
  await sleep(500);
}

async function sendAutoMessage(tabId, payload) {
  const result = await chrome.tabs.sendMessage(tabId, { action: "auto-send", payload });
  return result || { ok: false, error: "Zalo Web không phản hồi" };
}

async function ensureCrmBridgeForUrl(tabId, url) {
  if (!tabId || !url) return;
  const stored = await chrome.storage.sync.get(["crmBaseUrl"]);
  const base = String(stored.crmBaseUrl || "http://localhost:3000").replace(/\/$/, "");
  if (!url.startsWith(base)) return;
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { action: "crm-bridge-ping" }).catch(() => null);
    if (ping?.ok) return;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["crm-bridge.js"],
    });
  } catch {
    /* tab chưa sẵn sàng */
  }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" && tab?.url) {
    ensureCrmBridgeForUrl(tabId, tab.url);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === "crm-ping") {
    (async () => {
      const payload = message.payload || {};
      const stored = await chrome.storage.sync.get(["syncToken", "enabled", "campaignId", "crmBaseUrl"]);
      if (payload.syncToken && !stored.syncToken) {
        await chrome.storage.sync.set({
          syncToken: payload.syncToken,
          crmBaseUrl: payload.crmBaseUrl || stored.crmBaseUrl || "http://localhost:3000",
          enabled: true,
        });
        stored.syncToken = payload.syncToken;
      }
      const tab = await getZaloTab();
      let scriptOk = false;
      let zaloHasToken = false;
      let zaloLoggedIn = false;
      if (tab) {
        let pingRes = null;
        try {
          pingRes = await chrome.tabs.sendMessage(tab.id, { action: "ping" });
        } catch {
          await ensureZaloScripts(tab.id);
          try {
            pingRes = await chrome.tabs.sendMessage(tab.id, { action: "ping" });
          } catch {
            pingRes = null;
          }
        }
        scriptOk = Boolean(pingRes?.ok);
        zaloHasToken = Boolean(pingRes?.hasToken);
        zaloLoggedIn = Boolean(pingRes?.loggedIn);
      }
      const hasToken = Boolean(stored.syncToken) || Boolean(zaloHasToken) || Boolean(payload.syncToken);
      sendResponse({
        ok: hasToken && Boolean(tab) && scriptOk,
        hasToken,
        enabled: stored.enabled !== false,
        campaignId: stored.campaignId || payload.campaignId || null,
        zaloTabOpen: Boolean(tab),
        zaloScriptReady: scriptOk,
        zaloLoggedIn,
      });
    })();
    return true;
  }

  if (message?.action !== "crm-send") return false;

  (async () => {
    try {
      const payload = message.payload || {};
      const patch = {};
      if (payload.campaignId) patch.campaignId = payload.campaignId;
      if (payload.syncToken) {
        patch.syncToken = payload.syncToken;
        patch.enabled = true;
      }
      if (payload.crmBaseUrl) patch.crmBaseUrl = payload.crmBaseUrl;
      if (Object.keys(patch).length) await chrome.storage.sync.set(patch);
      const silent = payload.silent !== false;
      const returnTab = await getActiveCrmOrOtherTab();
      const tab = await getOrCreateZaloTab({ silent });
      await sleep(silent ? 400 : 600);
      let result = await sendAutoMessage(tab.id, payload).catch((e) => ({
        ok: false,
        error: e?.message || "Lỗi gửi",
      }));
      if (!result?.ok) {
        await sleep(silent ? 800 : 1200);
        result = await sendAutoMessage(tab.id, payload).catch((e) => ({
          ok: false,
          error: e?.message || "Lỗi gửi lần 2",
        }));
      }
      if (!result?.ok && silent) {
        await focusZaloTab(tab);
        await sleep(900);
        result = await sendAutoMessage(tab.id, payload).catch((e) => ({
          ok: false,
          error: e?.message || "Lỗi gửi (đã thử focus tab)",
        }));
      }
      if (silent) await restoreActiveTab(returnTab);
      sendResponse(result);
    } catch (error) {
      sendResponse({
        ok: false,
        error: error?.message || "Mở Chrome → chat.zalo.me → đăng nhập → reload extension",
      });
    }
  })();

  return true;
});
