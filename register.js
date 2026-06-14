const registerForm = document.getElementById("register-form");
const registerError = document.getElementById("register-error");
const registerSuccess = document.getElementById("register-success");
const submitBtn = document.getElementById("register-submit");

let submitting = false;

initRegisterPage();

function initRegisterPage() {
  registerForm?.addEventListener("submit", handleRegisterSubmit);
}

function showError(message) {
  registerSuccess?.classList.add("hidden");
  if (!registerError) return;
  registerError.textContent = message;
  registerError.classList.remove("hidden");
}

function showLoading(message) {
  registerError?.classList.add("hidden");
  if (!registerSuccess) return;
  registerSuccess.textContent = message;
  registerSuccess.classList.remove("hidden");
}

function setSubmitting(active) {
  submitting = active;
  if (submitBtn) {
    submitBtn.disabled = active;
    submitBtn.textContent = active ? "Đang đăng ký…" : "Đăng ký FREE";
  }
}

function goVerifyPage(email, devCode, verifyUrl) {
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

  setSubmitting(true);
  showLoading("Đang tạo tài khoản… Vui lòng đợi, không bấm lại.");

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
