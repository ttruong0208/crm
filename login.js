const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginError = document.getElementById("login-error");
const loginSuccess = document.getElementById("login-success");
const submitBtn = document.getElementById("login-submit");
const loadingPopup = document.getElementById("login-loading-popup");
const loadingMessage = document.getElementById("login-loading-message");

let submitting = false;

initLoginPage();

function warmUpServer() {
  fetch("/api/health", { credentials: "same-origin" }).catch(() => {});
}

function showLoadingPopup(message) {
  loginError?.classList.add("hidden");
  loginSuccess?.classList.add("hidden");
  if (loadingMessage) {
    loadingMessage.textContent = message || "Đang xác thực, vui lòng đợi…";
  }
  loadingPopup?.classList.remove("hidden");
  document.body.classList.add("auth-loading-open");
}

function hideLoadingPopup() {
  loadingPopup?.classList.add("hidden");
  document.body.classList.remove("auth-loading-open");
}

function setSubmitting(active, message) {
  submitting = active;
  if (submitBtn) {
    submitBtn.disabled = active;
    submitBtn.textContent = active ? "Đang đăng nhập…" : "Đăng nhập";
  }
  if (active) {
    showLoadingPopup(message);
    return;
  }
  hideLoadingPopup();
}

async function initLoginPage() {
  migrateLegacyToken();
  scheduleTokenRefreshFromStoredExpiry();
  warmUpServer();

  const params = new URLSearchParams(window.location.search);
  if (params.get("expired") === "1") {
    showLoginError("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
  }
  if (params.get("trial") === "expired") {
    showLoginError("Gói FREE 1 ngày đã hết hạn. Liên hệ quản trị hoặc xem bảng giá để nâng gói.");
  }

  const emailFromUrl = params.get("email");
  if (emailFromUrl && loginEmail) {
    loginEmail.value = emailFromUrl;
  }

  if (params.get("verified") === "1" && loginSuccess) {
    loginSuccess.textContent =
      "Email đã xác minh. Đăng nhập bằng email + mật khẩu (chủ TK) hoặc username + mật khẩu (nhân viên).";
    loginSuccess.classList.remove("hidden");
  }

  if (getAccessToken()) {
    showLoadingPopup("Đang kiểm tra phiên đăng nhập…");
    const me = await fetchCurrentUser();
    if (me) {
      window.location.href = "/app.html";
      return;
    }
    hideLoadingPopup();
  }

  loginForm?.addEventListener("submit", handleLoginSubmit);
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (submitting) return;

  loginError?.classList.add("hidden");
  loginSuccess?.classList.add("hidden");

  const loginId = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!loginId) {
    showLoginError("Nhập email (chủ tài khoản) hoặc username (nhân viên).");
    loginEmail.focus();
    return;
  }
  if (!password) {
    showLoginError("Nhập mật khẩu.");
    loginPassword.focus();
    return;
  }

  setSubmitting(true, "Đang đăng nhập… Lần đầu sau vài phút có thể mất 3–5 giây (server đang khởi động).");

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginId, password }),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.status === 403 && payload.code === "EMAIL_NOT_VERIFIED") {
      const email = payload.email || loginId;
      showError(
        `Email chưa xác minh. Vào trang nhập mã OTP: /verify-email.html?email=${encodeURIComponent(email)}`,
      );
      return;
    }
    if (response.status === 403 && payload.code === "TRIAL_EXPIRED") {
      showError(`${payload.message || "Gói FREE đã hết hạn."} Xem bảng giá để nâng gói.`);
      return;
    }
    if (!response.ok) {
      showError(payload.error || "Sai email hoặc mật khẩu.");
      return;
    }

    showLoadingPopup("Đăng nhập thành công. Đang vào CRM…");
    setAuthSession(payload);
    window.location.href = "/app.html";
  } catch {
    showError("Lỗi mạng khi đăng nhập. Thử lại sau vài giây.");
  }
}

function showError(message) {
  setSubmitting(false);
  showLoginError(message);
}

function showLoginError(message) {
  if (!loginError) return;
  loginError.textContent = message;
  loginError.classList.remove("hidden");
}
