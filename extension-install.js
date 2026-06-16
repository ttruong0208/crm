const EXTENSION_VERSION = "1.8.0";
const EXTENSION_ZIP_URL = "/downloads/zalo-crm-extension.zip";
const EXTENSION_GUIDE_URL = "/extension-install.html";
const EXTENSION_MODAL_SESSION_KEY = "crm_extension_modal_dismissed";

function extensionDownloadFilename() {
  return `zalo-crm-extension-v${EXTENSION_VERSION}.zip`;
}

function buildExtensionInstallCard({ compact = false, showDismiss = false } = {}) {
  const title = compact
    ? "Cần extension Chrome để quét nhóm &amp; Gửi Web"
    : "Cài extension Chrome (bước 1 — bắt buộc)";
  const lead = compact
    ? "Tải extension → giải nén → Load unpacked trong Chrome → dán mã sync từ menu <strong>Đồng bộ Zalo</strong>."
    : "Import nhóm tự động từ Zalo Web và gửi tin <strong>Gửi Web</strong> trong chiến dịch đều cần extension này.";

  return `
    <div class="extension-install-card${compact ? " extension-install-card--compact" : ""}">
      <div class="extension-install-icon" aria-hidden="true">🧩</div>
      <div class="extension-install-body">
        <h3>${title}</h3>
        <p class="item-meta extension-install-lead">${lead}</p>
        ${
          compact
            ? ""
            : `<ol class="extension-install-steps">
          <li>Bấm <strong>Tải extension</strong> bên dưới → giải nén ZIP ra một thư mục</li>
          <li>Mở <a href="https://chrome.google.com" target="_blank" rel="noopener">Chrome</a> → gõ <code>chrome://extensions</code> → bật <strong>Developer mode</strong></li>
          <li>Chọn <strong>Load unpacked</strong> → trỏ tới thư mục vừa giải nén</li>
          <li>CRM → <strong>Đồng bộ Zalo</strong> → <strong>Tạo mã đồng bộ</strong> → dán mã vào extension trên <a href="https://chat.zalo.me/" target="_blank" rel="noopener">chat.zalo.me</a></li>
        </ol>`
        }
        <div class="extension-install-actions">
          <a
            href="${EXTENSION_ZIP_URL}"
            download="${extensionDownloadFilename()}"
            class="btn-primary extension-download-btn"
          >⬇ Tải extension Chrome (v${EXTENSION_VERSION})</a>
          <a href="${EXTENSION_GUIDE_URL}" class="secondary landing-btn">Hướng dẫn cài chi tiết</a>
          <button type="button" class="secondary landing-btn" data-extension-open-sync>Đồng bộ Zalo →</button>
          ${
            showDismiss
              ? `<button type="button" class="secondary mini" data-extension-modal-dismiss>Đã cài — đóng</button>`
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

function buildExtensionConnectedStrip() {
  return `
    <div class="extension-connected-strip" role="status">
      <span aria-hidden="true">✓</span>
      <span>Extension Chrome đã kết nối CRM — có thể quét nhóm và Gửi Web.</span>
      <a href="${EXTENSION_ZIP_URL}" download="${extensionDownloadFilename()}" class="secondary mini extension-download-btn">⬇ Tải lại extension</a>
      <button type="button" class="secondary mini" data-extension-open-sync>Mã sync</button>
    </div>
  `;
}

function mountExtensionBanners() {
  document.querySelectorAll("[data-extension-banner]").forEach((el) => {
    const compact = el.dataset.compact === "1";
    el.innerHTML = buildExtensionInstallCard({ compact });
  });
  bindExtensionInstallActions();
}

function bindExtensionInstallActions() {
  document.querySelectorAll("[data-extension-open-sync]").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      hideExtensionInstallModal();
      if (typeof switchAppView === "function") {
        switchAppView("sync");
        return;
      }
      try {
        localStorage.setItem("crm_active_view", "sync");
      } catch {
        /* ignore */
      }
      window.location.href = "/app.html";
    });
  });

  document.querySelectorAll("[data-extension-modal-dismiss]").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      sessionStorage.setItem(EXTENSION_MODAL_SESSION_KEY, "1");
      hideExtensionInstallModal();
    });
  });
}

function updateExtensionInstallUi({ bridgeReady = false } = {}) {
  const connected = Boolean(bridgeReady || document.getElementById("zalo-crm-bridge-ready"));
  const banners = document.querySelectorAll("[data-extension-banner]:not([data-extension-banner='modal'])");

  banners.forEach((el) => {
    if (connected) {
      el.innerHTML = buildExtensionConnectedStrip();
    } else if (!el.innerHTML.trim() || el.querySelector(".extension-connected-strip")) {
      el.innerHTML = buildExtensionInstallCard({ compact: el.dataset.compact === "1" });
    }
  });

  bindExtensionInstallActions();
}

function showExtensionInstallModal(force = false) {
  const modal = document.getElementById("extension-install-modal");
  const slot = modal?.querySelector('[data-extension-banner="modal"]');
  if (!modal || !slot) return;

  if (!force && sessionStorage.getItem(EXTENSION_MODAL_SESSION_KEY) === "1") return;
  if (document.getElementById("zalo-crm-bridge-ready")) return;

  slot.innerHTML = buildExtensionInstallCard({ showDismiss: true });
  bindExtensionInstallActions();
  modal.classList.remove("hidden");
  document.body.classList.add("extension-modal-open");
}

function hideExtensionInstallModal() {
  const modal = document.getElementById("extension-install-modal");
  modal?.classList.add("hidden");
  document.body.classList.remove("extension-modal-open");
}

function initExtensionInstallUi() {
  mountExtensionBanners();
  const topDl = document.getElementById("topbar-extension-download");
  if (topDl) {
    topDl.href = EXTENSION_ZIP_URL;
    topDl.setAttribute("download", extensionDownloadFilename());
  }

  const modal = document.getElementById("extension-install-modal");
  modal?.querySelector(".extension-install-modal-backdrop")?.addEventListener("click", hideExtensionInstallModal);
  modal?.querySelector(".extension-install-modal-close")?.addEventListener("click", hideExtensionInstallModal);

  updateExtensionInstallUi({ bridgeReady: Boolean(document.getElementById("zalo-crm-bridge-ready")) });
}

window.ExtensionInstall = {
  EXTENSION_VERSION,
  EXTENSION_ZIP_URL,
  showModal: showExtensionInstallModal,
  hideModal: hideExtensionInstallModal,
  refresh: updateExtensionInstallUi,
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initExtensionInstallUi);
} else {
  initExtensionInstallUi();
}
