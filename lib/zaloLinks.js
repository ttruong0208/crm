const { normalizePhone } = require("./dedup");

function normalizeZaloChatId(id) {
  return String(id || "")
    .trim()
    .toLowerCase()
    .replace(/^g+/, "");
}

function zaloIdsMatch(a, b) {
  if (!a || !b) return false;
  const sa = String(a).trim().toLowerCase();
  const sb = String(b).trim().toLowerCase();
  if (sa === sb) return true;
  return normalizeZaloChatId(a) === normalizeZaloChatId(b);
}

function buildZaloChatUrl(group) {
  if (!group) return "https://chat.zalo.me/";
  const phone = normalizePhone(group.phone);
  const chatType = group.chatType || "group";

  if (chatType === "user" && phone.length >= 9) {
    const intl = phone.startsWith("0") ? `84${phone.slice(1)}` : phone;
    return `https://zalo.me/${intl}`;
  }

  return "https://chat.zalo.me/";
}

module.exports = { buildZaloChatUrl, normalizeZaloChatId, zaloIdsMatch };
