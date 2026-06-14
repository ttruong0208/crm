function downloadUserGuidePdf(triggerEl) {
  const btn = triggerEl instanceof HTMLElement ? triggerEl : null;
  const label = btn?.dataset?.labelDefault || btn?.textContent?.trim() || "";
  if (btn) {
    btn.disabled = true;
    btn.dataset.labelDefault = label;
    btn.textContent = "Đang tải PDF…";
  }

  const sources = ["/docs/Huong-dan-su-dung.pdf", "/api/docs/huong-dan.pdf"];

  (async () => {
    let lastError = null;
    for (const url of sources) {
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) {
          lastError = new Error(`HTTP ${res.status}`);
          continue;
        }
        const contentType = res.headers.get("content-type") || "";
        const blob = await res.blob();
        if (!blob.size || contentType.includes("text/html") || contentType.includes("application/json")) {
          lastError = new Error("invalid_payload");
          continue;
        }
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = "Huong-dan-Zalo-CRM.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    console.error("Guide PDF download failed:", lastError);
    alert("Không tải được PDF hướng dẫn. Thử F5 trang hoặc mở /docs/Huong-dan-su-dung.pdf trực tiếp.");
  })().finally(() => {
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
