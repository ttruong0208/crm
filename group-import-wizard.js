function initGroupImportWizard({ panel, toggleBtn, getRole, onImport }) {
  if (!panel) return;

  const els = {
    bookmarklet: panel.querySelector("#zalo-bookmarklet"),
    pasteInput: panel.querySelector("#import-paste-input"),
    csvFile: panel.querySelector("#import-csv-file"),
    previewBody: panel.querySelector("#import-preview-body"),
    previewCount: panel.querySelector("#import-preview-count"),
    status: panel.querySelector("#import-status"),
    result: panel.querySelector("#bulk-import-result"),
    zaloScanMeta: panel.querySelector("#import-zalo-scan-meta"),
  };

  let previewGroups = [];
  let lastScanAll = [];
  let excludedPreviewKeys = new Set();
  let scanImportFilter = "group";
  let scanPollTimer = null;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function setStatus(message) {
    if (els.status) els.status.textContent = message || "";
  }

  function setResult(message) {
    if (els.result) els.result.textContent = message || "";
  }

  function labelType(chatType) {
    return window.GroupImport?.labelChatType?.(chatType) || (chatType === "user" ? "Cá nhân" : "Nhóm");
  }

  function withoutExcluded(groups) {
    if (!excludedPreviewKeys.size) return groups;
    return (groups || []).filter((g) => !excludedPreviewKeys.has(previewRowKey(g)));
  }

  function applyScanImportFilter() {
    if (!lastScanAll.length) return;
    const filtered = withoutExcluded(
      window.GroupImport?.filterByChatType?.(lastScanAll, scanImportFilter) || lastScanAll,
    );
    renderPreview(filtered);
    const counts = window.GroupImport?.countChatTypes?.(lastScanAll) || { total: lastScanAll.length };
    setStatus(`Đang xem ${filtered.length} mục (lọc: ${scanImportFilter}) · Tổng quét: ${counts.group || 0} nhóm · ${counts.user || 0} cá nhân`);
  }

  function previewRowKey(group) {
    const id = String(group?.zaloGroupId || "").trim();
    if (id) return `id:${id}`;
    return `name:${String(group?.name || "")
      .trim()
      .toLowerCase()}`;
  }

  function removePreviewItem(index) {
    const item = previewGroups[index];
    if (!item) return;
    excludedPreviewKeys.add(previewRowKey(item));
    previewGroups = previewGroups.filter((_, i) => i !== index);
    renderPreview(previewGroups);
    setStatus(`Đã bỏ «${item.name}» — còn ${previewGroups.length} mục trong danh sách import.`);
  }

  function renderPreview(groups) {
    previewGroups = groups;
    if (els.previewCount) els.previewCount.textContent = String(groups.length);
    if (!els.previewBody) return;
    els.previewBody.innerHTML = groups
      .slice(0, 200)
      .map(
        (g, i) => `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(g.name)}</td>
          <td><span class="badge ${g.chatType === "user" ? "cold" : "warm"}">${escapeHtml(labelType(g.chatType))}</span></td>
          <td>${escapeHtml(g.owner || "")}</td>
          <td>${escapeHtml(g.zaloGroupId || "")}</td>
          <td><button type="button" class="secondary mini import-row-remove" data-remove-preview="${i}" title="Bỏ khỏi danh sách import">Xóa</button></td>
        </tr>`,
      )
      .join("");
    if (groups.length > 200) {
      setStatus(`Hiển thị 200/${groups.length} dòng đầu — xóa từng dòng hoặc lọc trước khi import.`);
    }
  }

  function parseFromPaste() {
    const text = els.pasteInput?.value || "";
    const groups = window.GroupImport.parseGroupInputAuto(text);
    renderPreview(groups);
    setStatus(
      groups.length
        ? `Đã đọc ${groups.length} nhóm từ ô dán.`
        : "Không có dòng hợp lệ — kiểm tra định dạng.",
    );
    return groups;
  }

  function downloadPreviewCsv() {
    if (!previewGroups.length) {
      const parsed = parseFromPaste();
      if (!parsed.length) return;
    }
    const blob = new Blob([window.GroupImport.groupsToCsv(previewGroups)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zalo_groups_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (els.pasteInput) els.pasteInput.value = text;
      parseFromPaste();
      setStatus("Đã dán từ clipboard — xem bảng bên dưới.");
    } catch {
      setStatus("Trình duyệt chặn đọc clipboard — Ctrl+V vào ô dán.");
    }
  }

  async function runImport() {
    if (!previewGroups.length) {
      parseFromPaste();
    }
    if (!previewGroups.length) {
      setResult("Chưa có nhóm — dán CSV hoặc quét Zalo trước.");
      return;
    }
    if (getRole() !== "admin") {
      setResult("Chỉ admin mới import hàng loạt.");
      return;
    }
    setResult("Đang import...");
    try {
      await onImport(previewGroups);
    } catch (e) {
      setResult(e.message || "Lỗi import.");
    }
  }

  async function loadZaloScanPreview(silent) {
    if (typeof apiFetch !== "function") return;
    try {
      const response = await apiFetch("/api/groups/zalo-scan");
      if (!response.ok) return;
      const payload = await response.json();
      lastScanAll = withoutExcluded(
        (payload?.scan?.groups || []).map((g) => ({
          ...g,
          chatType: window.GroupImport?.normalizeChatType?.(g.chatType, g.zaloGroupId) || g.chatType,
        })),
      );
      const counts = payload?.counts || payload?.scan?.counts || window.GroupImport?.countChatTypes?.(lastScanAll) || {};
      if (els.zaloScanMeta) {
        if (!lastScanAll.length) {
          els.zaloScanMeta.textContent = silent
            ? ""
            : "Chưa có lần quét nào — mở chat.zalo.me, bấm «Quét nhóm → gửi CRM» trên extension.";
        } else {
          const when = payload.scan.scannedAt
            ? new Date(payload.scan.scannedAt).toLocaleString()
            : "";
          els.zaloScanMeta.textContent = `Quét: ${counts.group || 0} nhóm · ${counts.user || 0} cá nhân · ${counts.unknown || 0} chưa rõ${when ? ` · ${when}` : ""}`;
        }
      }
      if (lastScanAll.length) {
        applyScanImportFilter();
        if (!silent) {
          setStatus("Chọn «Chỉ import: Nhóm Zalo» (mặc định) rồi bấm Import vào CRM.");
        }
      } else if (!silent) {
        setStatus("Chưa có dữ liệu quét — dùng extension trên chat.zalo.me trước.");
      }
      return lastScanAll.length;
    } catch {
      if (!silent && els.zaloScanMeta) {
        els.zaloScanMeta.textContent = "Không đọc được kết quả quét — kiểm tra server CRM đang chạy.";
      }
      return 0;
    }
  }

  function startScanPolling() {
    if (scanPollTimer) clearInterval(scanPollTimer);
    scanPollTimer = setInterval(() => {
      if (panel.classList.contains("hidden")) return;
      loadZaloScanPreview(true);
    }, 8000);
  }

  function stopScanPolling() {
    if (scanPollTimer) clearInterval(scanPollTimer);
    scanPollTimer = null;
  }

  if (els.bookmarklet && window.GroupImport?.buildZaloBookmarklet) {
    els.bookmarklet.href = window.GroupImport.buildZaloBookmarklet();
  }

  function reloadZaloScanPreview(resetExcluded) {
    if (resetExcluded) excludedPreviewKeys.clear();
    return loadZaloScanPreview(false);
  }

  panel.querySelector("#import-btn-zalo-scan")?.addEventListener("click", () => reloadZaloScanPreview(true));
  panel.querySelector("#import-btn-zalo-scan-refresh")?.addEventListener("click", () => reloadZaloScanPreview(true));
  panel.querySelectorAll("[data-scan-import-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      scanImportFilter = btn.getAttribute("data-scan-import-filter") || "group";
      panel.querySelectorAll("[data-scan-import-filter]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (lastScanAll.length) applyScanImportFilter();
    });
  });
  toggleBtn?.addEventListener("click", () => {
    if (!panel.classList.contains("hidden")) {
      loadZaloScanPreview(true);
      startScanPolling();
    } else {
      stopScanPolling();
    }
  });
  if (!panel.classList.contains("hidden")) {
    loadZaloScanPreview(true);
    startScanPolling();
  }

  els.previewBody?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-remove-preview]");
    if (!btn) return;
    const index = Number(btn.getAttribute("data-remove-preview"));
    if (!Number.isNaN(index)) removePreviewItem(index);
  });

  panel.querySelector("#import-btn-preview")?.addEventListener("click", parseFromPaste);
  panel.querySelector("#import-btn-clipboard")?.addEventListener("click", pasteFromClipboard);
  panel.querySelector("#import-btn-download")?.addEventListener("click", downloadPreviewCsv);
  panel.querySelector("#import-btn-run")?.addEventListener("click", runImport);

  panel.querySelector("#import-csv-file")?.addEventListener("change", () => {
    const file = els.csvFile?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const groups = window.GroupImport.parseGroupCsv(reader.result);
      if (els.pasteInput) els.pasteInput.value = reader.result;
      renderPreview(groups);
      setStatus(`Đã đọc ${groups.length} nhóm từ file ${file.name}.`);
    };
    reader.readAsText(file, "UTF-8");
  });

  panel.querySelector("#import-template-csv")?.addEventListener("click", (e) => {
    e.preventDefault();
    const sample = window.GroupImport.groupsToCsv([
      { name: "Nhóm khách A", owner: "Lan", zaloGroupId: "" },
      { name: "Nhóm khách B", owner: "", zaloGroupId: "123" },
    ]);
    const blob = new Blob([sample], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mau_import_nhom.csv";
    a.click();
    URL.revokeObjectURL(url);
  });

  if (location.hash === "#import") {
    panel.classList.remove("hidden");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return {
    setResult,
    loadZaloScanPreview,
    clearAfterImport: () => {
      if (els.pasteInput) els.pasteInput.value = "";
      excludedPreviewKeys.clear();
      previewGroups = [];
      renderPreview([]);
      setStatus("");
    },
    destroy: stopScanPolling,
  };
}

window.initGroupImportWizard = initGroupImportWizard;
