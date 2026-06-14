const verifyForm = document.getElementById("verify-form");
const verifyEmail = document.getElementById("verify-email");
const verifyCode = document.getElementById("verify-code");
const verifyError = document.getElementById("verify-error");
const verifySuccess = document.getElementById("verify-success");
const verifyDevCode = document.getElementById("verify-dev-code");
const resendBtn = document.getElementById("verify-resend");

initVerifyPage();

function initVerifyPage() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get("email");
  if (email && verifyEmail) {
    verifyEmail.value = email;
  }
  const devCode = params.get("devCode");
  if (devCode) {
    showDevCode(devCode);
  }

  verifyForm?.addEventListener("submit", handleVerifySubmit);
  resendBtn?.addEventListener("click", handleResendCode);
}

function showError(message) {
  verifySuccess?.classList.add("hidden");
  if (!verifyError) return;
  verifyError.textContent = message;
  verifyError.classList.remove("hidden");
}

function showSuccess(message) {
  verifyError?.classList.add("hidden");
  if (!verifySuccess) return;
  verifySuccess.textContent = message;
  verifySuccess.classList.remove("hidden");
}

function showDevCode(code) {
  if (!verifyDevCode || !code) return;
  verifyDevCode.classList.remove("hidden");
  verifyDevCode.innerHTML = `
    <strong>Dev (chưa gửi email thật):</strong> mã xác minh là
    <span class="verify-code-display">${escapeHtml(code)}</span>
  `;
}

async function handleVerifySubmit(event) {
  event.preventDefault();
  verifyError?.classList.add("hidden");

  const email = verifyEmail?.value.trim() || "";
  const code = verifyCode?.value.trim().replace(/\s/g, "") || "";

  if (!/^\d{6}$/.test(code)) {
    showError("Mã xác minh gồm 6 chữ số.");
    return;
  }

  try {
    const res = await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      showError(payload.error || "Mã không đúng hoặc đã hết hạn.");
      return;
    }
    showSuccess(payload.message || "Xác minh thành công!");
    verifyForm?.classList.add("hidden");
    setTimeout(() => {
      window.location.href = `/login.html?verified=1&email=${encodeURIComponent(email)}`;
    }, 1500);
  } catch {
    showError("Lỗi mạng khi xác minh.");
  }
}

async function handleResendCode() {
  verifyError?.classList.add("hidden");
  const email = verifyEmail?.value.trim() || "";
  if (!email) {
    showError("Nhập email trước khi gửi lại mã.");
    return;
  }
  try {
    const res = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const payload = await res.json().catch(() => ({}));
    showSuccess(payload.message || "Đã gửi mã mới (nếu email tồn tại).");
    if (payload.devCode) {
      showDevCode(payload.devCode);
    }
  } catch {
    showError("Không gửi được mã xác minh.");
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
