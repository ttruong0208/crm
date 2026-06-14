// ==UserScript==
// @name         Zalo CRM - Export danh sách hội thoại/nhóm
// @namespace    zalo-crm-mvp
// @version      1.0.0
// @description  Thu thập tên (và id nếu có) từ sidebar chat.zalo.me — user tự cài Tampermonkey
// @match        https://chat.zalo.me/*
// @match        https://*.zalo.me/*
// @grant        none
// ==/UserScript==

(function () {
  const PANEL_ID = "zalo-crm-export-panel";

  function extractFromDom() {
    const map = new Map();
    const selectors = [
      "[data-id][data-d-name]",
      "[data-chatid]",
      "[data-conv-id]",
      ".conv-item",
      ".thread-item",
      ".msg-item",
      '[class*="conv"]',
      '[class*="thread"]',
    ];

    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        const name =
          el.getAttribute("data-d-name") ||
          el.getAttribute("title") ||
          el.querySelector("[title]")?.getAttribute("title") ||
          el.textContent?.trim();
        const zaloGroupId =
          el.getAttribute("data-id") ||
          el.getAttribute("data-chatid") ||
          el.getAttribute("data-conv-id") ||
          "";
        if (!name || name.length < 2 || name.length > 120) return;
        if (/^\d+$/.test(name)) return;
        const key = zaloGroupId || name;
        if (!map.has(key)) {
          map.set(key, { name: name.replace(/\s+/g, " ").slice(0, 120), zaloGroupId });
        }
      });
    }

    return [...map.values()];
  }

  function toCsv(groups) {
    const lines = [
      "ten_nhom,nguoi_phu_trach,zalo_group_id",
      ...groups.map((g) =>
        [`"${g.name.replaceAll('"', '""')}"`, '""', `"${(g.zaloGroupId || "").replaceAll('"', '""')}"`].join(
          ",",
        ),
      ),
    ];
    return lines.join("\n");
  }

  function downloadCsv(groups) {
    const blob = new Blob([toCsv(groups)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zalo_groups_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();

    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText =
      "position:fixed;bottom:16px;right:16px;z-index:99999;background:#fff;border:1px solid #ccc;padding:12px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);font:14px Inter,sans-serif;max-width:320px;";
    panel.innerHTML = `
      <strong>Zalo CRM Export</strong>
      <p style="margin:8px 0;font-size:12px;color:#666">Mở danh sách chat/nhóm bên trái rồi bấm Quét.</p>
      <button id="zalo-crm-scan" style="margin-right:6px;padding:8px 12px;cursor:pointer">Quét trang</button>
      <button id="zalo-crm-dl" style="padding:8px 12px;cursor:pointer">Tải CSV</button>
      <p id="zalo-crm-status" style="margin:8px 0 0;font-size:12px"></p>
      <a href="/tools/group-export.html" target="_blank" style="font-size:12px">Mở tool import CRM</a>
    `;
    document.body.appendChild(panel);

    let last = [];
    panel.querySelector("#zalo-crm-scan").onclick = () => {
      last = extractFromDom();
      panel.querySelector("#zalo-crm-status").textContent = `Tìm thấy ${last.length} mục. Nếu = 0, cuộn danh sách chat rồi quét lại.`;
    };
    panel.querySelector("#zalo-crm-dl").onclick = () => {
      if (!last.length) last = extractFromDom();
      if (!last.length) {
        alert("Chưa thấy nhóm. Hãy mở chat.zalo.me và cuộn danh sách hội thoại.");
        return;
      }
      downloadCsv(last);
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderPanel);
  } else {
    renderPanel();
  }
})();
