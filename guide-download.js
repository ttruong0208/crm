function downloadUserGuidePdf(triggerEl) {
  const btn = triggerEl instanceof HTMLElement ? triggerEl : null;
  const label = btn?.dataset?.labelDefault || btn?.textContent?.trim() || "";
  if (btn) {
    btn.disabled = true;
    btn.dataset.labelDefault = label;
    btn.textContent = "Đang tải PDF…";
  }

  fetch("/api/docs/huong-dan.pdf", { credentials: "same-origin" })
    .then((res) => {
      if (!res.ok) throw new Error("download_failed");
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Huong-dan-Zalo-CRM.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    })
    .catch(() => {
      alert("Không tải được PDF hướng dẫn. Thử F5 trang hoặc liên hệ Admin.");
    })
    .finally(() => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset.labelDefault || "📖 Hướng dẫn PDF";
      }
    });
}

function bindGuideDownloadButtons() {
  document.querySelectorAll("[data-download-guide]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      downloadUserGuidePdf(el);
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindGuideDownloadButtons);
} else {
  bindGuideDownloadButtons();
}
