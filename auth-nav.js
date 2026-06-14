/** Cập nhật menu trang công khai theo trạng thái đăng nhập (JWT trong localStorage). */
async function initAuthNav() {
  migrateLegacyToken();
  scheduleTokenRefreshFromStoredExpiry();

  const user = await fetchCurrentUser();
  const loggedIn = Boolean(user);
  const displayName = user?.email || user?.username || "Tài khoản";

  document.querySelectorAll("[data-auth-guest]").forEach((el) => {
    el.classList.toggle("hidden", loggedIn);
    el.setAttribute("aria-hidden", loggedIn ? "true" : "false");
  });

  document.querySelectorAll("[data-auth-user]").forEach((el) => {
    el.classList.toggle("hidden", !loggedIn);
    el.setAttribute("aria-hidden", loggedIn ? "false" : "true");
  });

  document.querySelectorAll("[data-auth-user-name]").forEach((el) => {
    el.textContent = displayName;
  });

  document.querySelectorAll("[data-auth-logout]").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => logoutUser("/login.html"));
  });
}

if (document.querySelector("[data-auth-nav]") || document.querySelector("[data-auth-guest]")) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuthNav);
  } else {
    initAuthNav();
  }
}
