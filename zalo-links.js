function normalizePhoneClient(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

/** Chuẩn hóa ID chat Zalo (bỏ tiền tố g trùng). */
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
  const phone = normalizePhoneClient(group.phone);
  const chatType = group.chatType || "group";

  if (chatType === "user" && phone.length >= 9) {
    const intl = phone.startsWith("0") ? `84${phone.slice(1)}` : phone;
    return `https://zalo.me/${intl}`;
  }

  // Nhóm: link zalo.me/g/... thường lỗi trên web → luôn mở chat.zalo.me
  // Extension/ người dùng tìm nhóm theo tên trong sidebar
  return "https://chat.zalo.me/";
}

window.buildZaloChatUrl = buildZaloChatUrl;
window.normalizeZaloChatId = normalizeZaloChatId;
window.zaloIdsMatch = zaloIdsMatch;
