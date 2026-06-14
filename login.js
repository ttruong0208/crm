const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginError = document.getElementById("login-error");
const loginSuccess = document.getElementById("login-success");

initLoginPage();

async function initLoginPage() {
  migrateLegacyToken();
  scheduleTokenRefreshFromStoredExpiry();

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
    loginSuccess.textContent = "Email đã xác minh. Đăng nhập bằng email + mật khẩu (chủ TK) hoặc username + mật khẩu (nhân viên).";
    loginSuccess.classList.remove("hidden");
  }

  const me = await fetchCurrentUser();
  if (me) {
    window.location.href = "/app.html";
    return;
  }

  loginForm?.addEventListener("submit", handleLoginSubmit);
}

async function handleLoginSubmit(event) {
  event.preventDefault();
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

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginId, password }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 403 && payload.code === "EMAIL_NOT_VERIFIED") {
      showLoginError("Email chưa xác minh. Hoàn tất đăng ký (nhập mã email) trước khi đăng nhập.");
      return;
    }
    if (response.status === 403 && payload.code === "TRIAL_EXPIRED") {
      showLoginError(`${payload.message || "Gói FREE đã hết hạn."} Xem bảng giá để nâng gói.`);
      return;
    }
    if (!response.ok) {
      throw new Error(payload.error || "Sai email hoặc mật khẩu.");
    }
    setAuthSession(payload);
    window.location.href = "/app.html";
  } catch (error) {
    showLoginError(error.message || "Đăng nhập thất bại.");
  }
}

function showLoginError(message) {
  if (!loginError) return;
  loginError.textContent = message;
  loginError.classList.remove("hidden");
}
