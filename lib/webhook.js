async function fireWebhook(url, secret, event, payload) {
  const target = String(url || "").trim();
  if (!target) return { ok: false, skipped: true };

  const body = JSON.stringify({
    event,
    at: new Date().toISOString(),
    ...payload,
  });

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "Zalo-CRM-MVP/1.0",
  };
  if (secret) headers["X-Zalo-CRM-Secret"] = secret;

  try {
    const response = await fetch(target, { method: "POST", headers, body });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = { fireWebhook };
