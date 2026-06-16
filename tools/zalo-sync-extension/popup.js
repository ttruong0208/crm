const fields = {
  crmUrl: document.getElementById("crm-url"),
  syncToken: document.getElementById("sync-token"),
  enabled: document.getElementById("enabled"),
  msg: document.getElementById("msg"),
  scanBtn: document.getElementById("scan-btn"),
};

function setMsg(text, isError) {
  fields.msg.textContent = text || "";
  fields.msg.className = isError ? "err" : "ok";
}

function saveConfig() {
  return new Promise((resolve) => {
    const rawUrl = fields.crmUrl.value.trim();
    const payload = {
      crmBaseUrl: typeof resolveCrmBaseUrl === "function" ? resolveCrmBaseUrl(rawUrl) : rawUrl || "https://crm-alpha-henna-85.vercel.app",
      syncToken: fields.syncToken.value.trim(),
      enabled: fields.enabled.checked,
    };
    chrome.storage.sync.set(payload, () => resolve(payload));
  });
}

chrome.storage.sync.get(["crmBaseUrl", "syncToken", "enabled"], (stored) => {
  fields.crmUrl.value =
    typeof resolveCrmBaseUrl === "function"
      ? resolveCrmBaseUrl(stored.crmBaseUrl)
      : stored.crmBaseUrl || "https://crm-alpha-henna-85.vercel.app";
  fields.syncToken.value = stored.syncToken || "";
  fields.enabled.checked = stored.enabled !== false;
});

document.getElementById("save").onclick = async () => {
  const saved = await saveConfig();
  fields.crmUrl.value = saved.crmBaseUrl;
  if (!saved.syncToken) {
    setMsg("Đã lưu URL — cần dán mã đồng bộ từ CRM (menu Đồng bộ Zalo).", true);
    return;
  }
  setMsg("Đã lưu — mở chat.zalo.me, dán mã vào panel Zalo CRM, bấm Lưu cấu hình để kiểm tra.");
};

document.getElementById("open-zalo").onclick = () => {
  chrome.tabs.create({ url: "https://chat.zalo.me/" });
  setMsg("Đã mở Zalo Web — đăng nhập xong bấm «Quét nhóm → gửi CRM».");
};

document.getElementById("scan-btn").onclick = async () => {
  if (!fields.syncToken.value.trim()) {
    setMsg("Chưa có mã — copy từ CRM rồi bấm Lưu trước.", true);
    return;
  }
  await saveConfig();
  fields.scanBtn.disabled = true;
  setMsg("Đang quét... giữ tab chat.zalo.me mở, đợi 1–3 phút.");

  const tabs = await chrome.tabs.query({ url: ["https://chat.zalo.me/*", "https://*.zalo.me/*"] });
  const zaloTab = tabs.find((t) => t.url && t.url.includes("chat.zalo.me")) || tabs[0];

  if (!zaloTab?.id) {
    setMsg("Chưa có tab Zalo — bấm «Mở chat.zalo.me» trước.", true);
    fields.scanBtn.disabled = false;
    return;
  }

  try {
    const result = await chrome.tabs.sendMessage(zaloTab.id, { action: "scan-groups" });
    if (!result?.ok) {
      setMsg(result?.error || "Quét thất bại — reload extension rồi thử lại.", true);
      return;
    }
    const c = result.counts || result.payload?.counts;
    const summary = c
      ? `${c.group || 0} nhóm · ${c.user || 0} cá nhân${c.unknown ? ` · ${c.unknown} chưa rõ` : ""}`
      : `${result.count || result.payload?.count || "?"} mục`;
    setMsg(`✓ CRM: ${summary}. Import → «Hiện danh sách vừa quét».`);
  } catch {
    setMsg("Không quét được — mở chat.zalo.me, F5 trang Zalo, reload extension, thử lại.", true);
  } finally {
    fields.scanBtn.disabled = false;
  }
};
