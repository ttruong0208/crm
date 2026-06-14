function parseGroupLines(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const groups = [];
  for (const line of lines) {
    if (/^ten nhom|^name|^group/i.test(line) && groups.length === 0) {
      continue;
    }
    const parts = line.includes("\t")
      ? line.split("\t").map((p) => p.trim())
      : line.split(/[,;]/).map((p) => p.trim());
    const name = parts[0];
    if (!name) continue;
    const chatType = /^user|ca_nhan|personal$/i.test(parts[3] || "") ? "user" : "group";
    groups.push({
      name,
      owner: parts[1] || "",
      zaloGroupId: parts[2] || "",
      chatType: parts[3] ? chatType : "group",
    });
  }
  return groups;
}

function parseGroupCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());
  const hasHeader = header.some((h) => /name|ten|nhom|group/.test(h));

  const startIndex = hasHeader ? 1 : 0;
  const nameIdx = header.findIndex((h) => /^(ten nhom|ten|name|group)$/.test(h));
  const ownerIdx = header.findIndex((h) => /^(owner|phu trach|nguoi)/.test(h));
  const idIdx = header.findIndex((h) => /^(id|zalo|groupid|ma)/.test(h));
  const typeIdx = header.findIndex((h) => /^(loai|type|chat_type|chattype)$/.test(h));

  const groups = [];
  for (let i = startIndex; i < lines.length; i += 1) {
    const cols = lines[i].split(delimiter).map((c) => c.replace(/^"|"$/g, "").trim());
    const name = nameIdx >= 0 ? cols[nameIdx] : cols[0];
    if (!name) continue;
    const typeRaw = typeIdx >= 0 ? cols[typeIdx] || "" : "";
    const chatType = /user|ca_nhan|personal|friend/i.test(typeRaw) ? "user" : "group";
    groups.push({
      name,
      owner: ownerIdx >= 0 ? cols[ownerIdx] || "" : cols[1] || "",
      zaloGroupId: idIdx >= 0 ? cols[idIdx] || "" : cols[2] || "",
      chatType: typeRaw ? chatType : "group",
    });
  }
  return groups;
}

function mergeGroups(existingGroups, incomingGroups, options = {}) {
  const skipDuplicates = options.skipDuplicates !== false;
  const result = [...existingGroups];
  let imported = 0;
  let skipped = 0;

  const indexByName = new Map(result.map((g) => [g.name.trim().toLowerCase(), g]));
  const indexByZaloId = new Map(
    result.filter((g) => g.zaloGroupId).map((g) => [g.zaloGroupId, g]),
  );

  for (const row of incomingGroups) {
    const name = row.name?.trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    const zaloGroupId = row.zaloGroupId?.trim() || "";
    const owner = row.owner?.trim() || "";
    const key = name.toLowerCase();

    if (skipDuplicates && (indexByName.has(key) || (zaloGroupId && indexByZaloId.has(zaloGroupId)))) {
      skipped += 1;
      continue;
    }

    const chatType = row.chatType === "user" ? "user" : row.chatType === "unknown" ? "unknown" : "group";
    const group = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name,
      owner,
      zaloGroupId,
      chatType,
      createdAt: Date.now(),
    };
    result.push(group);
    indexByName.set(key, group);
    if (zaloGroupId) indexByZaloId.set(zaloGroupId, group);
    imported += 1;
  }

  return { groups: result, imported, skipped };
}

function groupsToCsv(groups) {
  const header = ["ten_nhom", "nguoi_phu_trach", "zalo_group_id", "loai"];
  const rows = groups.map((g) => [
    g.name || "",
    g.owner || "",
    g.zaloGroupId || "",
    g.chatType === "user" ? "user" : g.chatType === "unknown" ? "unknown" : "group",
  ]);
  return [header, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function parseGroupInput(text, isCsv) {
  return isCsv ? parseGroupCsv(text) : parseGroupLines(text);
}

/** Bookmarklet chạy trên chat.zalo.me — copy CSV vào clipboard (không cài extension). */
function buildZaloBookmarklet() {
  const code = `(function(){if(!/zalo\\.me/i.test(location.hostname)){alert("M\\u1edf chat.zalo.me tr\\u01b0\\u1edbc, \\u0111\\u0103ng nh\\u1eadp, cu\\u1ed9n danh s\\u00e1ch b\\u00ean tr\\u00e1i r\\u1ed3i b\\u1ea5m bookmark l\\u1ea1i.");return}var m=new Map();function add(n,i){n=String(n||"").replace(/\\s+/g," ").trim();if(!n||n.length<2||n.length>120||/^\\d+$/.test(n))return;if(/t\\u00ecm ki\\u1ebfm|search|zalo me/i.test(n))return;var k=i||n.toLowerCase();if(!m.has(k))m.set(k,{name:n.slice(0,120),id:i||""})}var sels=["[data-id][data-d-name]","[data-d-name]","[data-chatid]","[data-conv-id]",".conv-item",".thread-item",".msg-item",'[class*="conv"]','[class*="thread"]'];sels.forEach(function(sel){try{document.querySelectorAll(sel).forEach(function(e){var n=e.getAttribute("data-d-name")||e.getAttribute("title")||(e.querySelector("[title]")&&e.querySelector("[title]").getAttribute("title"))||"";if(!n)n=(e.textContent||"").trim().split("\\n")[0];var i=e.getAttribute("data-id")||e.getAttribute("data-chatid")||e.getAttribute("data-conv-id")||"";add(n,i)})}catch(x){}});if(m.size<2){document.querySelectorAll("[title]").forEach(function(e){add(e.getAttribute("title"),"")})}var r=[].slice.call(m.values());if(!r.length){alert("Kh\\u00f4ng th\\u1ea5y nh\\u00f3m.\\n\\n1) Tab chat.zalo.me \\u0111\\u00e3 \\u0111\\u0103ng nh\\u1eadp?\\n2) Cu\\u1ed9n CH\\u1eacM danh s\\u00e1ch chat b\\u00ean tr\\u00e1i t\\u1eeb tr\\u00ean xu\\u1ed1ng\\n3) B\\u1ea5m bookmark l\\u1ea1i\\n\\nHo\\u1eb7c copy t\\u00ean nh\\u00f3m d\\u00e1n th\\u1eb3ng v\\u00e0o CRM.");return}var q=function(s){return'"'+String(s).replace(/"/g,'""')+'"'},csv="ten_nhom,nguoi_phu_trach,zalo_group_id\\n";r.forEach(function(x){csv+=q(x.name)+",,"+q(x.id)+"\\n"});function ok(){alert("\\u0110\\u00e3 copy "+r.length+" nh\\u00f3m!\\nQuay CRM \\u2192 Import \\u2192 D\\u00e1n t\\u1eeb clipboard.")}if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(csv).then(ok).catch(function(){prompt("Copy CSV:",csv)});else prompt("Copy CSV:",csv)})();`;
  return `javascript:${encodeURIComponent(code)}`;
}

function parseGroupInputAuto(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const firstLine = raw.split(/\r?\n/)[0] || "";
  const looksCsv =
    firstLine.includes(",") &&
    /ten|name|nhom|group|phu trach|zalo/i.test(firstLine.toLowerCase());
  return looksCsv ? parseGroupCsv(raw) : parseGroupLines(raw);
}

function inferChatTypeFromId(zaloGroupId) {
  const raw = String(zaloGroupId || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (/^g\d/.test(lower) || /^sg\d/.test(lower) || lower.startsWith("group")) return "group";
  if (/^u\d/.test(lower) || /^user/.test(lower)) return "user";
  if (/^\d{5,}$/.test(raw)) return "user";
  return null;
}

function normalizeChatType(chatType, zaloGroupId) {
  const t = String(chatType || "").toLowerCase();
  if (t === "user" || t === "personal" || t === "friend") return "user";
  if (t === "group" || t === "nhom") return "group";
  return inferChatTypeFromId(zaloGroupId) || "unknown";
}

function filterByChatType(groups, mode) {
  if (mode === "all") return groups || [];
  return (groups || []).filter((g) => normalizeChatType(g.chatType, g.zaloGroupId) === mode);
}

function countChatTypes(groups) {
  const counts = { group: 0, user: 0, unknown: 0, total: 0 };
  (groups || []).forEach((g) => {
    const t = normalizeChatType(g.chatType, g.zaloGroupId);
    counts[t] += 1;
    counts.total += 1;
  });
  return counts;
}

function labelChatType(chatType) {
  if (chatType === "user") return "Cá nhân";
  if (chatType === "unknown") return "Chưa rõ";
  return "Nhóm";
}

window.GroupImport = {
  parseGroupLines,
  parseGroupCsv,
  parseGroupInput,
  parseGroupInputAuto,
  mergeGroups,
  groupsToCsv,
  filterByChatType,
  countChatTypes,
  normalizeChatType,
  inferChatTypeFromId,
  labelChatType,
  buildZaloBookmarklet,
};
