const registerForm = document.getElementById("register-form");
const registerError = document.getElementById("register-error");
const registerSuccess = document.getElementById("register-success");

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

async function handleRegisterSubmit(event) {
  event.preventDefault();
  registerError?.classList.add("hidden");

  const email = document.getElementById("register-email")?.value.trim();
  const password = document.getElementById("register-password")?.value || "";
  const password2 = document.getElementById("register-password2")?.value || "";

  if (password !== password2) {
    showError("Mật khẩu nhập lại không khớp.");
    return;
  }

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, passwordConfirm: password2, plan: "free" }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (payload.code === "EMAIL_PENDING_VERIFICATION" && payload.verifyUrl) {
        window.location.href = payload.verifyUrl;
        return;
      }
      if (payload.code === "EMAIL_ALREADY_REGISTERED") {
        showError(`${payload.error} Nếu quên mật khẩu, liên hệ quản trị workspace hoặc đăng nhập lại bằng email đã đăng ký.`);
        return;
      }
      showError(payload.error || "Đăng ký thất bại.");
      return;
    }

    const params = new URLSearchParams({ email: payload.email || email });
    if (payload.devCode) {
      params.set("devCode", payload.devCode);
    }
    window.location.href = `/verify-email.html?${params.toString()}`;
  } catch {
    showError("Lỗi mạng khi đăng ký.");
  }
}
