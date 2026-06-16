/** URL CRM mặc định — production. Dev local: sửa tay thành http://localhost:3000 */
const ZALO_CRM_DEFAULT_URL = "https://crm-alpha-henna-85.vercel.app";

function isLocalCrmUrl(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(String(url || "").trim());
}

function resolveCrmBaseUrl(stored) {
  const raw = String(stored || "").trim().replace(/\/$/, "");
  if (!raw || isLocalCrmUrl(raw)) return ZALO_CRM_DEFAULT_URL;
  if (!/^https?:\/\//i.test(raw)) return `https://${raw}`;
  try {
    const parsed = new URL(raw);
    if (parsed.hostname.endsWith(".vercel.app") && parsed.protocol === "http:") {
      return parsed.origin.replace(/^http:/i, "https:");
    }
    return parsed.origin;
  } catch {
    return ZALO_CRM_DEFAULT_URL;
  }
}

if (typeof globalThis !== "undefined") {
  globalThis.ZALO_CRM_DEFAULT_URL = ZALO_CRM_DEFAULT_URL;
  globalThis.resolveCrmBaseUrl = resolveCrmBaseUrl;
  globalThis.isLocalCrmUrl = isLocalCrmUrl;
}
