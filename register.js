const registerForm = document.getElementById("register-form");
const registerError = document.getElementById("register-error");
const registerSuccess = document.getElementById("register-success");
const submitBtn = document.getElementById("register-submit");
const loadingPopup = document.getElementById("register-loading-popup");
const loadingMessage = document.getElementById("register-loading-message");

let submitting = false;

initRegisterPage();

function initRegisterPage() {
  registerForm?.addEventListener("submit", handleRegisterSubmit);
}

function showError(message) {
  hideLoadingPopup();
  registerSuccess?.classList.add("hidden");
  if (!registerError) return;
  registerError.textContent = message;
  registerError.classList.remove("hidden");
}

function showLoadingPopup(message) {
  registerError?.classList.add("hidden");
  registerSuccess?.classList.add("hidden");
  if (loadingMessage) {
    loadingMessage.textContent = message || "Đang tạo tài khoản, vui lòng đợi.";
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
    submitBtn.textContent = active ? "Đang đăng ký…" : "Đăng ký FREE";
  }
  if (active) {
    showLoadingPopup(message);
    return;
  }
  hideLoadingPopup();
}

function goVerifyPage(email, devCode, verifyUrl) {
  showLoadingPopup("Đăng ký thành công. Đang chuyển trang xác minh…");
  if (verifyUrl) {
    window.location.href = verifyUrl;
    return;
  }
  const params = new URLSearchParams({ email });
  if (devCode) params.set("devCode", devCode);
  window.location.href = `/verify-email.html?${params.toString()}`;
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  if (submitting) return;

  registerError?.classList.add("hidden");
  registerSuccess?.classList.add("hidden");

  const email = document.getElementById("register-email")?.value.trim();
  const password = document.getElementById("register-password")?.value || "";
  const password2 = document.getElementById("register-password2")?.value || "";

  if (password !== password2) {
    showError("Mật khẩu nhập lại không khớp.");
    return;
  }

  setSubmitting(true, "Đang tạo tài khoản… Vui lòng đợi, không bấm lại.");

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, passwordConfirm: password2, plan: "free" }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (payload.code === "EMAIL_PENDING_VERIFICATION") {
        goVerifyPage(payload.email || email, null, payload.verifyUrl);
        return;
      }
      if (payload.code === "EMAIL_ALREADY_REGISTERED") {
        showError(
          `${payload.error} Nếu quên mật khẩu, liên hệ quản trị workspace hoặc đăng nhập lại bằng email đã đăng ký.`,
        );
        setSubmitting(false);
        return;
      }
      showError(payload.error || "Đăng ký thất bại.");
      setSubmitting(false);
      return;
    }

    goVerifyPage(payload.email || email, payload.devCode, payload.verifyUrl);
  } catch {
    showError("Lỗi mạng khi đăng ký. Thử lại sau vài giây.");
    setSubmitting(false);
  }
}
