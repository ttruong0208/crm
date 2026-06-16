/** Cầu nối CRM ↔ extension (localhost hoặc VPS — inject qua background nếu cần) */
(function initCrmBridge() {
  if (window.__zaloCrmBridgeLoaded) return;
  window.__zaloCrmBridgeLoaded = true;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.action === "crm-bridge-ping") {
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });
  const flag = document.createElement("div");
  flag.id = "zalo-crm-bridge-ready";
  flag.style.display = "none";
  document.documentElement.appendChild(flag);

  window.postMessage({ type: "zalo-crm-bridge-ready", version: "1.7.3" }, "*");

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data?.type) return;

    if (data.type === "zalo-crm-set-campaign" && data.campaignId) {
      chrome.storage.sync.set({ campaignId: data.campaignId });
      return;
    }

    if (data.type === "zalo-crm-set-sync" && data.syncToken) {
      chrome.storage.sync.set({
        syncToken: data.syncToken,
        crmBaseUrl: data.crmBaseUrl || (typeof ZALO_CRM_DEFAULT_URL !== "undefined" ? ZALO_CRM_DEFAULT_URL : "https://crm-alpha-henna-85.vercel.app"),
        enabled: true,
      });
      return;
    }

    if (data.type === "zalo-crm-ping-request") {
      chrome.runtime
        .sendMessage({ action: "crm-ping", payload: data.payload || {} })
        .then((result) => {
          window.postMessage({ type: "zalo-crm-ping-result", result: result || { ok: false } }, "*");
        })
        .catch(() => {
          window.postMessage(
            {
              type: "zalo-crm-ping-result",
              result: { ok: false, error: "Extension chưa cài hoặc chưa reload" },
            },
            "*",
          );
        });
      return;
    }

    if (data.type !== "zalo-crm-send-request") return;

    const payload = data.payload;
    if (!payload) return;

    if (payload.campaignId) {
      chrome.storage.sync.set({ campaignId: payload.campaignId });
    }

    chrome.runtime
      .sendMessage({ action: "crm-send", payload })
      .then((result) => {
        window.postMessage(
          { type: "zalo-crm-send-result", result: result || { ok: false, error: "Không có phản hồi" } },
          "*",
        );
      })
      .catch((err) => {
        window.postMessage(
          {
            type: "zalo-crm-send-result",
            result: {
              ok: false,
              error: err?.message || "Reload extension v1.6 rồi F5 CRM",
            },
          },
          "*",
        );
      });
  });
})();
