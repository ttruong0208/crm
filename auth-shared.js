const AUTH_ACCESS_KEY = "zalo_campaign_crm_access";
const AUTH_REFRESH_KEY = "zalo_campaign_crm_refresh";
const LEGACY_TOKEN_KEY = "zalo_campaign_crm_token";

let accessTokenExpiresAt = 0;
let refreshTimer = null;
let isRefreshing = false;
let refreshWaiters = [];

function migrateLegacyToken() {
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacy && !getAccessToken()) {
    localStorage.setItem(AUTH_ACCESS_KEY, legacy);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
}

function setAuthSession(payload) {
  const accessToken = payload.accessToken || payload.token;
  const refreshToken = payload.refreshToken;
  const expiresIn = Number(payload.expiresIn || 900);

  if (!accessToken) return;
  localStorage.setItem(AUTH_ACCESS_KEY, accessToken);
  if (refreshToken) {
    localStorage.setItem(AUTH_REFRESH_KEY, refreshToken);
  }
  localStorage.removeItem(LEGACY_TOKEN_KEY);

  accessTokenExpiresAt = Date.now() + expiresIn * 1000;
  localStorage.setItem("zalo_campaign_crm_token_exp", String(accessTokenExpiresAt));
  scheduleTokenRefresh(expiresIn);
}

function scheduleTokenRefreshFromStoredExpiry() {
  const stored = Number(localStorage.getItem("zalo_campaign_crm_token_exp") || 0);
  if (!stored || !getAccessToken()) return;
  accessTokenExpiresAt = stored;
  const secondsLeft = Math.max(Math.floor((stored - Date.now()) / 1000), 0);
  if (secondsLeft <= 0) {
    refreshAccessToken();
    return;
  }
  scheduleTokenRefresh(secondsLeft);
}

function scheduleTokenRefresh(expiresInSeconds) {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (!getRefreshToken()) return;
  const delayMs = Math.max((expiresInSeconds - 60) * 1000, 5000);
  refreshTimer = setTimeout(() => {
    refreshAccessToken();
  }, delayMs);
}

function getAccessToken() {
  return localStorage.getItem(AUTH_ACCESS_KEY) || "";
}

function getRefreshToken() {
  return localStorage.getItem(AUTH_REFRESH_KEY) || "";
}

function clearAuthTokens() {
  localStorage.removeItem(AUTH_ACCESS_KEY);
  localStorage.removeItem(AUTH_REFRESH_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem("zalo_campaign_crm_token_exp");
  accessTokenExpiresAt = 0;
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  if (isRefreshing) {
    return new Promise((resolve) => {
      refreshWaiters.push(resolve);
    });
  }

  isRefreshing = true;
  try {
    const response = await fetch("/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;
    const payload = await response.json();
    setAuthSession(payload);
    refreshWaiters.forEach((resolve) => resolve(true));
    refreshWaiters = [];
    return true;
  } catch {
    return false;
  } finally {
    isRefreshing = false;
  }
}

function fetchWithAuth(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

async function apiFetch(url, options = {}) {
  const isAuthRoute = url.includes("/api/login") || url.includes("/api/refresh");
  let response = await fetchWithAuth(url, options);

  if (response.status === 401 && !isAuthRoute && getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await fetchWithAuth(url, options);
    }
  }

  if (response.status === 401 && getAccessToken() && !isAuthRoute && document.body.dataset.page === "app") {
    clearAuthTokens();
    window.location.href = "/login.html?expired=1";
  }

  if (response.status === 403 && getAccessToken() && !isAuthRoute && document.body.dataset.page === "app") {
    const payload = await response.clone().json().catch(() => ({}));
    if (payload.code === "TRIAL_EXPIRED") {
      clearAuthTokens();
      window.location.href = `/login.html?trial=expired`;
    }
  }

  return response;
}

async function fetchCurrentUser() {
  if (!getAccessToken()) return null;
  try {
    const response = await apiFetch("/api/me");
    if (!response.ok) {
      if (response.status === 401) clearAuthTokens();
      return null;
    }
    const payload = await response.json();
    return payload.user || null;
  } catch {
    return null;
  }
}

function logoutUser(redirectTo = "/") {
  clearAuthTokens();
  window.location.href = redirectTo;
}
