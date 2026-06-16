/**
 * Chạy trên chat.zalo.me — phát hiện gửi tin → báo CRM đánh dấu "Đã gửi".
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ZaloCrmSync = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STORAGE_KEY = "zalo_crm_sync_config";
  const recentKeys = new Map();

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const cfg = raw ? JSON.parse(raw) : {};
      const resolved = typeof resolveCrmBaseUrl === "function"
        ? resolveCrmBaseUrl(cfg.crmBaseUrl)
        : cfg.crmBaseUrl || "https://crm-alpha-henna-85.vercel.app";
      if (cfg.crmBaseUrl !== resolved) {
        cfg.crmBaseUrl = resolved;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
        if (typeof chrome !== "undefined" && chrome.storage?.sync) {
          chrome.storage.sync.set({ crmBaseUrl: resolved });
        }
      }
      return cfg;
    } catch {
      return {
        crmBaseUrl:
          typeof ZALO_CRM_DEFAULT_URL !== "undefined"
            ? ZALO_CRM_DEFAULT_URL
            : "https://crm-alpha-henna-85.vercel.app",
      };
    }
  }

  function saveConfig(config) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  function normalizeCrmBaseUrl(raw) {
    if (typeof resolveCrmBaseUrl === "function") return resolveCrmBaseUrl(raw);
    const fallback =
      typeof ZALO_CRM_DEFAULT_URL !== "undefined"
        ? ZALO_CRM_DEFAULT_URL
        : "https://crm-alpha-henna-85.vercel.app";
    let url = String(raw || fallback).trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const parsed = new URL(url);
      if (parsed.hostname.endsWith(".vercel.app") && parsed.protocol === "http:") {
        parsed.protocol = "https:";
        url = parsed.origin;
      }
    } catch {
      /* keep as-is */
    }
    return url;
  }

  function explainFetchError(error, crmBase) {
    const msg = String(error?.message || error || "");
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      if (/localhost|127\.0\.0\.1/i.test(crmBase)) {
        return "Không kết nối được CRM — URL đang là localhost. Đổi thành https://crm-alpha-henna-85.vercel.app (hoặc domain CRM của bạn).";
      }
      if (/^http:\/\//i.test(crmBase)) {
        return "Không kết nối được CRM — phải dùng https:// (Zalo Web chặn gọi http).";
      }
      return `Không kết nối được CRM tại ${crmBase} — kiểm tra URL, mạng, hoặc CRM đang deploy.`;
    }
    return msg || "Lỗi kết nối CRM";
  }

  async function crmFetch(crmBase, path, options = {}) {
    const base = normalizeCrmBaseUrl(crmBase);
    try {
      return await fetch(`${base}${path}`, options);
    } catch (error) {
      throw new Error(explainFetchError(error, base));
    }
  }

  async function testCrmConnection(config) {
    const cfg = config || loadConfig();
    const crmBase = normalizeCrmBaseUrl(cfg.crmBaseUrl);
    const syncToken = String(cfg.syncToken || "").trim();
    if (!syncToken) {
      return { ok: false, error: "Chưa có mã đồng bộ — copy từ CRM → Đồng bộ Zalo → Tạo mã." };
    }

    const health = await crmFetch(crmBase, "/api/health");
    if (!health.ok) {
      return { ok: false, error: `CRM không phản hồi (${health.status}) — kiểm tra URL: ${crmBase}` };
    }

    const heartbeat = await crmFetch(crmBase, "/api/sync/heartbeat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Zalo-Sync-Token": syncToken,
      },
      body: JSON.stringify({ extensionVersion: EXTENSION_VERSION, browser: navigator.userAgent }),
    });
    const payload = await heartbeat.json().catch(() => ({}));
    if (!heartbeat.ok) {
      return {
        ok: false,
        error: payload.error || "Mã đồng bộ sai hoặc hết hạn — vào CRM tạo mã mới.",
      };
    }
    return { ok: true, crmBase };
  }

  function normalizeName(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function isNoiseName(name) {
    const n = String(name || "").toLowerCase();
    return !n || /tìm kiếm|search|zalo me|đăng nhập|login/.test(n);
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

  function resolveChatType(chatType, zaloGroupId, el) {
    if (chatType === "group" || chatType === "user") return chatType;
    const fromId = inferChatTypeFromId(zaloGroupId);
    if (fromId) return fromId;
    if (el) {
      const fromDom = detectChatTypeFromDom(el);
      if (fromDom !== "unknown") return fromDom;
    }
    return "unknown";
  }

  function detectChatTypeFromDom(el) {
    if (!el || !(el instanceof Element)) return "unknown";
    const node =
      el.closest?.(
        '[class*="conv-item"], [class*="thread-item"], [class*="conversation"], [data-id], [data-chatid]',
      ) || el;

    const ids = [
      node.getAttribute?.("data-id"),
      node.getAttribute?.("data-chatid"),
      node.getAttribute?.("data-conv-id"),
    ];
    for (const id of ids) {
      const t = inferChatTypeFromId(id);
      if (t) return t;
    }

    const attrBlob = [
      node.getAttribute?.("data-is-group"),
      node.getAttribute?.("data-group"),
      node.getAttribute?.("data-conv-type"),
      node.getAttribute?.("data-type"),
      node.getAttribute?.("data-ts"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (/group|nhom|grp|room|multi/.test(attrBlob)) return "group";
    if (/user|friend|personal|private|single|direct/.test(attrBlob)) return "user";

    const cls = `${node.className || ""} ${node.parentElement?.className || ""}`.toLowerCase();
    if (/group|nhom|grp|conv-group|multi-avatar|group-avatar/.test(cls)) return "group";
    if (/friend|personal|user-chat|single-chat|1-1/.test(cls)) return "user";

    const text = (node.textContent || "").toLowerCase();
    if (/\d+\s*thành viên|\d+\s*members|thành viên/.test(text)) return "group";

    const avatars = node.querySelectorAll?.('img, [class*="avatar"], [class*="Avatar"]');
    if (avatars && avatars.length >= 2) return "group";

    return "unknown";
  }

  function getWebpackBridge() {
    return typeof ZaloCrmWebpack !== "undefined" ? ZaloCrmWebpack : null;
  }

  async function runProbeDiagnostics() {
    const bridge = getWebpackBridge();
    const api = bridge ? await bridge.fetchChatsFromZaloApi() : { items: [], meta: {} };
    const react = extractGroupsFromReact();
    const dom = extractGroupsFromDom();
    return {
      webpack: Boolean(window.webpackJsonp || window.webpackChunkzalo_web),
      moduleIdsInMemory: bridge ? bridge.getModuleIdsFromChunks().length : 0,
      groupHit: api.meta?.groupHit || null,
      friendHit: api.meta?.friendHit || null,
      internalCount: api.items.length,
      reactCount: react.length,
      domCount: dom.length,
      internalSample: api.items.slice(0, 2),
    };
  }

  async function fetchChatsFromZaloInternals() {
    const bridge = getWebpackBridge();
    if (!bridge) return { items: [], meta: null };
    return bridge.fetchChatsFromZaloApi();
  }

  function getReactFiber(node) {
    if (!node) return null;
    const key = Object.keys(node).find(
      (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
    );
    return key ? node[key] : null;
  }

  function chatTypeFromRecord(src) {
    if (!src || typeof src !== "object") return "unknown";
    if (src.isGroup === true || src.convType === 1 || src.type === 2 || src.threadType === 1) {
      return "group";
    }
    if (src.isGroup === false || src.convType === 0 || src.type === 1 || src.threadType === 0) {
      return "user";
    }
    return "unknown";
  }

  function recordFromConvSource(src) {
    if (!src || typeof src !== "object") return null;
    const name = String(
      src.displayName || src.dName || src.name || src.groupName || src.title || src.nickname || "",
    ).trim();
    let id = String(
      src.convId || src.userId || src.groupId || src.id || src.uid || src.grid || src.toId || "",
    ).trim();
    let chatType = chatTypeFromRecord(src);
    const fromId = inferChatTypeFromId(id);
    if (fromId) chatType = fromId;
    if (chatType === "group" && id && !/^g/i.test(id)) id = `g${id}`;
    if (!name && !id) return null;
    return {
      name: (name || id).slice(0, 120),
      zaloGroupId: id,
      owner: "",
      chatType: chatType === "unknown" ? resolveChatType("unknown", id, null) : chatType,
    };
  }

  function extractConvFromProps(props, depth = 0) {
    if (!props || typeof props !== "object" || depth > 4) return null;
    const nested = [
      props.conversation,
      props.conv,
      props.data,
      props.item,
      props.thread,
      props.convItem,
      props.chat,
    ];
    for (const src of [props, ...nested.filter(Boolean)]) {
      const row = recordFromConvSource(src);
      if (row) return row;
    }
    for (const value of Object.values(props)) {
      if (!value || typeof value !== "object") continue;
      if (Array.isArray(value)) {
        for (const child of value) {
          const row = recordFromConvSource(child);
          if (row) return row;
        }
      } else {
        const row = extractConvFromProps(value, depth + 1);
        if (row) return row;
      }
    }
    return null;
  }

  function walkFiberTree(fiber, out, depth = 0) {
    if (!fiber || depth > 14) return;
    const props = fiber.memoizedProps || fiber.pendingProps;
    const row = extractConvFromProps(props);
    if (row) {
      const key = row.zaloGroupId || normalizeName(row.name);
      if (!out.has(key)) out.set(key, row);
    }
    if (fiber.child) walkFiberTree(fiber.child, out, depth + 1);
    if (fiber.sibling) walkFiberTree(fiber.sibling, out, depth + 1);
  }

  function extractIdFromElement(el) {
    let node = el;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const attrs = node.attributes;
      if (attrs) {
        for (const attr of attrs) {
          const v = String(attr.value || "").trim();
          if (/^g\d{4,}/i.test(v) || /^\d{8,}$/.test(v)) return v;
        }
      }
      for (const name of ["data-id", "data-chatid", "data-conv-id", "data-item-id"]) {
        const v = node.getAttribute?.(name);
        if (v) return v;
      }
      node = node.parentElement;
    }
    return "";
  }

  function extractGroupsFromReact() {
    const map = new Map();
    const roots = document.querySelectorAll(
      '[class*="conv"], [class*="thread"], [class*="conversation"], [data-id], [data-d-name]',
    );
    roots.forEach((el) => {
      const fiber = getReactFiber(el);
      if (fiber) walkFiberTree(fiber, map);
      const id = extractIdFromElement(el);
      const name =
        el.getAttribute?.("data-d-name") ||
        el.getAttribute?.("title") ||
        String(el.textContent || "")
          .trim()
          .split("\n")[0];
      if (name) {
        addReactRow(map, name, id, el);
      }
    });
    return [...map.values()];
  }

  function addReactRow(map, name, zaloGroupId, el) {
    const n = String(name || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!n || n.length < 2 || isNoiseName(n)) return;
    const id = String(zaloGroupId || "").trim();
    const key = id || normalizeName(n);
    const chatType = resolveChatType("unknown", id, el);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { name: n.slice(0, 120), zaloGroupId: id, owner: "", chatType });
      return;
    }
    if (existing.chatType === "unknown" && chatType !== "unknown") existing.chatType = chatType;
    if (!existing.zaloGroupId && id) existing.zaloGroupId = id;
  }

  function extractGroupsFromDom() {
    const map = new Map();
    const add = (name, zaloGroupId, el) => {
      const n = String(name || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!n || n.length < 2 || n.length > 120 || /^\d+$/.test(n) || isNoiseName(n)) return;
      const id = String(zaloGroupId || "").trim();
      const key = id || normalizeName(n);
      const chatType = resolveChatType("unknown", id, el);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { name: n.slice(0, 120), zaloGroupId: id, owner: "", chatType });
        return;
      }
      if (existing.chatType === "unknown" && chatType !== "unknown") {
        existing.chatType = chatType;
      }
      if (!existing.zaloGroupId && id) existing.zaloGroupId = id;
    };

    const selectors = [
      "[data-id][data-d-name]",
      "[data-d-name]",
      "[data-chatid]",
      "[data-conv-id]",
      ".conv-item",
      ".thread-item",
      ".msg-item",
      '[class*="conv-item"]',
      '[class*="thread-item"]',
      '[class*="conversation"]',
    ];

    for (const sel of selectors) {
      try {
        document.querySelectorAll(sel).forEach((el) => {
          const name =
            el.getAttribute("data-d-name") ||
            el.getAttribute("title") ||
            el.querySelector?.("[title]")?.getAttribute("title") ||
            "";
          const textName = name || String(el.textContent || "").trim().split("\n")[0];
          const zaloGroupId =
            el.getAttribute("data-id") ||
            el.getAttribute("data-chatid") ||
            el.getAttribute("data-conv-id") ||
            extractIdFromElement(el) ||
            "";
          add(textName, zaloGroupId, el);
        });
      } catch {
        // ignore bad selector on dynamic DOM
      }
    }

    if (map.size < 2) {
      document.querySelectorAll("[title]").forEach((el) => {
        add(el.getAttribute("title"), "", el);
      });
    }

    return [...map.values()];
  }

  function countChatTypes(rows) {
    const counts = { group: 0, user: 0, unknown: 0, total: 0 };
    (rows || []).forEach((row) => {
      const t = resolveChatType(row.chatType, row.zaloGroupId, null);
      counts[t] += 1;
      counts.total += 1;
    });
    return counts;
  }

  function applyNameHints(rows) {
    const groupNames = new Set();
    const userNames = new Set();
    (rows || []).forEach((row) => {
      const n = normalizeName(row.name);
      if (!n) return;
      const t = resolveChatType(row.chatType, row.zaloGroupId, null);
      if (t === "group") groupNames.add(n);
      if (t === "user") userNames.add(n);
    });
    return (rows || []).map((row) => {
      const t = resolveChatType(row.chatType, row.zaloGroupId, null);
      if (t !== "unknown") return { ...row, chatType: t };
      const n = normalizeName(row.name);
      if (groupNames.has(n)) return { ...row, chatType: "group" };
      if (userNames.has(n)) return { ...row, chatType: "user" };
      return { ...row, chatType: "unknown" };
    });
  }

  function findSidebarScroller() {
    const selectors = [
      '[class*="list-conversation"]',
      '[class*="conversation-list"]',
      '[class*="thread-list"]',
      '[class*="conv-list"]',
      ".leftbar-content",
      "#conversationList",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight + 40) return el;
    }
    return [...document.querySelectorAll("*")].find((el) => {
      const st = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        (st.overflowY === "auto" || st.overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight + 80 &&
        rect.left < window.innerWidth * 0.4 &&
        rect.width > 80
      );
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const CONV_FILTER_TABS = [
    { key: "priority", labels: ["Ưu tiên", "uu tien", "Priority"] },
    { key: "other", labels: ["Khác", "Khac", "Other"] },
  ];

  function normalizeVnText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function findConvFilterTab(tab) {
    const wanted = tab.labels.map(normalizeVnText);
    const scope =
      document.querySelector('[class*="list-conversation"]')?.closest("[class*='left']") ||
      document.querySelector(".leftbar-content")?.parentElement ||
      document.body;
    const nodes = scope.querySelectorAll('[role="tab"], button, [class*="tab-item"], [class*="Tab"]');
    for (const el of nodes) {
      const raw = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!raw || raw.length > 24) continue;
      const text = normalizeVnText(raw);
      if (!wanted.some((w) => text === w || text.startsWith(w))) continue;
      const clickable = el.closest('[role="tab"], button') || el;
      const rect = clickable.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4 || rect.top > window.innerHeight * 0.45) continue;
      return clickable;
    }
    return null;
  }

  async function clickConvFilterTab(tab, delayMs) {
    const el = findConvFilterTab(tab);
    if (!el) return false;
    el.click();
    await sleep(delayMs || 500);
    return true;
  }

  async function scrollSidebarAndExtract(merge, onProgress, map, options = {}) {
    const maxSteps = options.maxSteps ?? 80;
    const scroller = findSidebarScroller();
    merge(extractGroupsFromReact());
    merge(extractGroupsFromDom());
    if (!scroller) return;

    const step = Math.max(120, Math.floor(scroller.clientHeight * 0.75));
    scroller.scrollTop = 0;
    await sleep(300);

    let lastTop = -1;
    for (let i = 0; i < maxSteps; i += 1) {
      scroller.scrollTop += step;
      await sleep(options.scrollDelayMs || 280);
      merge(extractGroupsFromReact());
      merge(extractGroupsFromDom());
      onProgress(map.size, `Đang cuộn... (${map.size})`);
      if (scroller.scrollTop === lastTop) break;
      lastTop = scroller.scrollTop;
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
        merge(extractGroupsFromDom());
        break;
      }
    }
    scroller.scrollTop = 0;
  }

  async function scanAllConvTabs(merge, onProgress, map, options = {}) {
    const tabs = CONV_FILTER_TABS.filter((tab) => findConvFilterTab(tab));
    if (!tabs.length) {
      await scrollSidebarAndExtract(merge, onProgress, map, options);
      return;
    }
    for (const tab of tabs) {
      const switched = await clickConvFilterTab(tab, options.tabDelayMs);
      if (!switched) continue;
      onProgress(map.size, `Quét tab «${tab.labels[0]}»...`);
      await scrollSidebarAndExtract(merge, onProgress, map, options);
    }
  }

  async function scanAllGroups(options = {}) {
    const onProgress = options.onProgress || (() => {});
    const map = new Map();
    const merge = (list) => {
      list.forEach((g) => {
        const chatType = resolveChatType(g.chatType, g.zaloGroupId, null);
        const item = { ...g, chatType };
        const key = item.zaloGroupId || normalizeName(item.name);
        const existing = map.get(key);
        if (!existing) {
          map.set(key, item);
          return;
        }
        if (existing.chatType === "unknown" && item.chatType !== "unknown") {
          existing.chatType = item.chatType;
        }
        if (!existing.zaloGroupId && item.zaloGroupId) existing.zaloGroupId = item.zaloGroupId;
      });
    };

    onProgress(0, "Đang lấy danh sách từ API Zalo...");
    const apiResult = await fetchChatsFromZaloInternals();
    const internal = apiResult.items || [];
    const apiMeta = apiResult.meta || null;
    if (internal.length) merge(internal);

    const apiCounts = countChatTypes(internal);
    const apiRichEnough = apiCounts.group >= 10;
    const scrollOpts = {
      maxSteps: apiRichEnough ? options.lightMaxSteps || 15 : options.maxSteps || 80,
      scrollDelayMs: options.scrollDelayMs || 280,
      tabDelayMs: options.tabDelayMs || 500,
    };

    if (apiRichEnough) {
      onProgress(
        map.size,
        `API: ${apiCounts.group} nhóm · ${apiCounts.user} CN — bổ sung tab Ưu tiên + Khác...`,
      );
    } else {
      onProgress(map.size, "Quét tab Ưu tiên + Khác (cuộn danh sách)...");
    }

    await scanAllConvTabs(merge, onProgress, map, scrollOpts);

    const groups = applyNameHints([...map.values()]).sort((a, b) =>
      a.name.localeCompare(b.name, "vi"),
    );
    groups.__scanMeta = apiMeta;
    return groups;
  }

  async function pushGroupsScanToCrm(groups, config) {
    const cfg = config || loadConfig();
    const crmBase = normalizeCrmBaseUrl(cfg.crmBaseUrl);
    const syncToken = cfg.syncToken || "";
    if (!syncToken) {
      return { ok: false, error: "Chưa cấu hình mã đồng bộ CRM" };
    }
    if (!groups.length) {
      return { ok: false, error: "Không thấy nhóm trên Zalo Web" };
    }

    const scanMeta = groups.__scanMeta || null;
    const counts = countChatTypes(groups);
    const payloadGroups = groups.map((g) => ({ ...g }));

    const response = await crmFetch(crmBase, "/api/sync/scan-groups", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Zalo-Sync-Token": syncToken,
      },
      body: JSON.stringify({
        groups: payloadGroups,
        source: "zalo-web-extension",
        counts,
        meta: scanMeta,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: payload.error || "Gửi danh sách thất bại", payload };
    }
    return { ok: true, payload, count: groups.length, counts };
  }

  function getActiveChatInfo() {
    const activeSelectors = [
      ".conv-item.active",
      ".conv-item.selected",
      '[class*="conv-item"][class*="active"]',
      '[class*="thread-item"][class*="active"]',
      '[aria-selected="true"]',
    ];

    let node = null;
    for (const sel of activeSelectors) {
      node = document.querySelector(sel);
      if (node) break;
    }

    const scope = node || document;
    const nameEl =
      scope.querySelector("[data-d-name]") ||
      scope.closest?.("[data-d-name]") ||
      document.querySelector("[data-d-name].active, [data-d-name][class*='active']");

    const idEl = nameEl || scope;
    const groupName =
      nameEl?.getAttribute("data-d-name") ||
      nameEl?.getAttribute("title") ||
      document.querySelector('[class*="header"] [title]')?.getAttribute("title") ||
      document.querySelector('[class*="chat-info"]')?.textContent?.trim() ||
      "";

    const zaloGroupId =
      idEl?.getAttribute("data-id") ||
      idEl?.getAttribute("data-chatid") ||
      idEl?.getAttribute("data-conv-id") ||
      "";

    return {
      groupName: groupName.replace(/\s+/g, " ").trim().slice(0, 120),
      zaloGroupId: String(zaloGroupId || "").trim(),
    };
  }

  function isSendClick(target) {
    if (!(target instanceof Element)) return false;
    const btn = target.closest(
      'button, [role="button"], [class*="send"], [class*="Send"], [data-id*="send"]',
    );
    if (!btn) return false;
    const label = `${btn.getAttribute("aria-label") || ""} ${btn.className || ""} ${btn.textContent || ""}`.toLowerCase();
    return /send|gửi|gui|submit|paper|plane|arrow/.test(label) || btn.querySelector("svg");
  }

  function isComposeEnter(event) {
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    if (target.tagName === "TEXTAREA") return true;
    if (target.isContentEditable) return true;
    return Boolean(target.closest('[contenteditable="true"], [class*="input"], [class*="editor"], [class*="compose"]'));
  }

  function shouldSkipDuplicate(key) {
    const now = Date.now();
    const last = recentKeys.get(key) || 0;
    if (now - last < 4000) return true;
    recentKeys.set(key, now);
    return false;
  }

  function getComposePreview() {
    const candidates = [
      document.querySelector('[contenteditable="true"][class*="input"]'),
      document.querySelector('[contenteditable="true"]'),
      document.querySelector('textarea[class*="input"]'),
      document.querySelector('div[contenteditable="true"]'),
    ].filter(Boolean);
    for (const el of candidates) {
      const text = String(el.textContent || el.value || "").trim();
      if (text) return text.slice(0, 200);
    }
    return "";
  }

  async function notifyCrmInteraction(chatInfo, config, summary, type) {
    const cfg = config || loadConfig();
    const crmBase = normalizeCrmBaseUrl(cfg.crmBaseUrl);
    const syncToken = cfg.syncToken || "";
    if (!syncToken) return { ok: false };
    try {
      await crmFetch(crmBase, "/api/sync/interaction", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Zalo-Sync-Token": syncToken,
        },
        body: JSON.stringify({
          groupName: chatInfo.groupName,
          zaloGroupId: chatInfo.zaloGroupId,
          summary,
          type: type || "chat",
          messagePreview: summary,
        }),
      });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async function notifyCrmSent(chatInfo, config) {
    const cfg = config || loadConfig();
    const crmBase = normalizeCrmBaseUrl(cfg.crmBaseUrl);
    const syncToken = cfg.syncToken || "";
    if (!syncToken) {
      return { ok: false, error: "Chưa cấu hình mã đồng bộ CRM" };
    }

    const messagePreview = getComposePreview();
    const body = {
      groupName: chatInfo.groupName,
      zaloGroupId: chatInfo.zaloGroupId,
      campaignId: cfg.broadcastId ? null : cfg.campaignId || null,
      broadcastId: cfg.broadcastId || null,
      messagePreview,
      source: "zalo-web",
    };

    let response;
    try {
      response = await crmFetch(crmBase, "/api/sync/zalo-sent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Zalo-Sync-Token": syncToken,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      return { ok: false, error: error.message || "Không kết nối được CRM" };
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: payload.error || "CRM sync failed", payload };
    }
    return { ok: true, payload };
  }

  const EXTENSION_VERSION = "1.6.0";

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  let heartbeatTimer = null;

  async function sendHeartbeat(config) {
    const cfg = config || loadConfig();
    const crmBase = normalizeCrmBaseUrl(cfg.crmBaseUrl);
    const syncToken = cfg.syncToken || "";
    if (!syncToken || cfg.enabled === false) return { ok: false };
    try {
      const response = await crmFetch(crmBase, "/api/sync/heartbeat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Zalo-Sync-Token": syncToken,
        },
        body: JSON.stringify({
          extensionVersion: EXTENSION_VERSION,
          browser: navigator.userAgent,
        }),
      });
      return { ok: response.ok };
    } catch {
      return { ok: false };
    }
  }

  function startHeartbeat(config) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    sendHeartbeat(config);
    heartbeatTimer = setInterval(() => sendHeartbeat(config), 5 * 60 * 1000);
  }

  function getComposeElement() {
    const byPh = document.querySelector(
      '[contenteditable="true"][placeholder*="Nhập"], [placeholder*="tin nhắn"], textarea[placeholder*="Nhập"]',
    );
    if (byPh) return byPh;

    const editables = [...document.querySelectorAll('[contenteditable="true"], textarea')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 80 && r.height > 20;
    });
    editables.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
    return editables[0] || null;
  }

  function setStatusPanel(text, isError) {
    const el = document.getElementById("zcs-status");
    if (!el) return;
    el.textContent = text || "";
    el.style.color = isError ? "#dc2626" : "#16a34a";
  }

  async function setComposeText(el, text) {
    if (!el) return;
    el.focus();
    await sleep(150);
    if (el.tagName === "TEXTAREA") {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    try {
      el.textContent = "";
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData: dt, cancelable: true }));
    } catch {
      /* fallback */
    }
    try {
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    } catch {
      el.textContent = text;
    }
    el.dispatchEvent(
      new InputEvent("beforeinput", { bubbles: true, data: text, inputType: "insertText", cancelable: true }),
    );
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, data: text, inputType: "insertText", cancelable: true }),
    );
  }

  function clickSendButton() {
    const scopes = [
      document.querySelector('[class*="chat-box"]'),
      document.querySelector('[class*="input-area"]'),
      document.querySelector('[class*="footer"]'),
      document.body,
    ].filter(Boolean);
    for (const scope of scopes) {
      const icons = scope.querySelectorAll(
        'button, [role="button"], span[class*="send"], div[class*="send"], i[class*="send"]',
      );
      for (const btn of icons) {
        if (isSendClick(btn)) {
          btn.click();
          return true;
        }
      }
    }
    return false;
  }

  function submitCompose(compose) {
    compose.focus();
    if (clickSendButton()) return "click";
    for (let i = 0; i < 2; i += 1) {
      for (const type of ["keydown", "keypress", "keyup"]) {
        compose.dispatchEvent(
          new KeyboardEvent(type, {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    }
    return "enter";
  }

  function composeHasText(compose, text) {
    const cur = String(compose?.textContent || compose?.value || "").trim();
    return cur === String(text || "").trim();
  }

  function chatHeaderName() {
    const el =
      document.querySelector('[class*="header"] [data-d-name]') ||
      document.querySelector('[class*="chat-info"] [data-d-name]') ||
      document.querySelector('[class*="header"] [title]');
    return String(el?.getAttribute("data-d-name") || el?.getAttribute("title") || el?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function zaloIdsMatch(a, b) {
    if (!a || !b) return false;
    const sa = String(a).trim().toLowerCase();
    const sb = String(b).trim().toLowerCase();
    if (sa === sb) return true;
    const strip = (x) => x.replace(/^g+/, "");
    return strip(sa) === strip(sb);
  }

  function matchConvItem(item, key, zaloGroupId) {
    const name = item.getAttribute("data-d-name") || item.getAttribute("title") || item.textContent || "";
    const id = item.getAttribute("data-id") || item.getAttribute("data-chatid") || item.getAttribute("data-conv-id") || "";
    const nKey = normalizeName(name);
    if (key && nKey === key) return true;
    if (key && nKey && (nKey.includes(key) || key.includes(nKey))) return true;
    if (zaloGroupId && zaloIdsMatch(id, zaloGroupId)) return true;
    return false;
  }

  async function scrollConvList() {
    const list =
      document.querySelector('[class*="conv-list"]') ||
      document.querySelector('[class*="list-conv"]') ||
      document.querySelector("aside [class*='scroll']") ||
      document.querySelector("aside");
    if (!list) return;
    for (let i = 0; i < 5; i += 1) {
      list.scrollTop = list.scrollHeight;
      await sleep(350);
    }
    list.scrollTop = 0;
    await sleep(200);
  }

  async function findAndOpenChat({ groupName, zaloGroupId }) {
    const key = normalizeName(groupName);
    await scrollConvList();

    const itemSelector = '.conv-item, [class*="conv-item"], [class*="thread-item"], [data-id][data-d-name]';
    let items = document.querySelectorAll(itemSelector);
    for (const item of items) {
      if (matchConvItem(item, key, zaloGroupId)) {
        item.click();
        await sleep(800);
        return true;
      }
    }

    const searchInput = document.querySelector(
      'input[placeholder*="Tìm"], input[placeholder*="tim"], input[placeholder*="Search"], input[type="search"], input[class*="search"]',
    );
    if (searchInput && groupName) {
      searchInput.focus();
      searchInput.value = "";
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(150);
      searchInput.value = groupName;
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchInput.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(1200);
      items = document.querySelectorAll(itemSelector);
      for (const item of items) {
        if (matchConvItem(item, key, zaloGroupId)) {
          item.click();
          await sleep(800);
          return true;
        }
      }
      const first = document.querySelector(itemSelector);
      if (first) {
        first.click();
        await sleep(800);
        return true;
      }
    }
    return false;
  }

  async function autoSendMessage(payload = {}) {
    const config = {
      ...loadConfig(),
      campaignId: payload.campaignId || loadConfig().campaignId || null,
    };
    if (config.enabled === false) {
      return { ok: false, error: "Extension đang tắt — bật «Tự đánh dấu đã gửi»" };
    }
    if (!config.syncToken) {
      return { ok: false, error: "Chưa cấu hình mã đồng bộ trên Zalo Web" };
    }

    const groupName = String(payload.groupName || "").trim();
    const zaloGroupId = String(payload.zaloGroupId || "").trim();
    const message = String(payload.message || "").trim();
    if (!message) return { ok: false, error: "Tin nhắn trống" };

    setStatusPanel(`CRM: đang gửi tới «${groupName}»...`, false);

    const header = chatHeaderName();
    const headerMatch = groupName && header && normalizeName(header) === normalizeName(groupName);
    if (!headerMatch) {
      const opened = await findAndOpenChat({ groupName, zaloGroupId });
      if (!opened) {
        setStatusPanel(`Không tìm thấy «${groupName}» trong sidebar`, true);
        return {
          ok: false,
          error: `Không tìm thấy «${groupName}» — trên chat.zalo.me: click nhóm «${groupName}» bên trái trước, rồi bấm Gửi (Web) lại`,
        };
      }
      await sleep(500);
    }

    const compose = getComposeElement();
    if (!compose) {
      setStatusPanel("Không thấy ô soạn tin", true);
      return { ok: false, error: "Không thấy ô soạn tin — mở đúng khung chat nhóm trên chat.zalo.me" };
    }

    await setComposeText(compose, message);
    await sleep(400);
    submitCompose(compose);
    await sleep(700);
    if (composeHasText(compose, message)) {
      submitCompose(compose);
      await sleep(700);
    }

    if (composeHasText(compose, message)) {
      setStatusPanel("Chưa gửi được — thử Enter thủ công", true);
      return {
        ok: false,
        error:
          "Zalo Web chưa gửi được tự động — hãy click vào ô tin trên chat.zalo.me rồi nhấn Enter. Hoặc dùng app Zalo PC + bấm «✓ Đã gửi» trên CRM.",
      };
    }

    const chat = { groupName, zaloGroupId };
    const notifyConfig = {
      ...config,
      broadcastId: payload.broadcastId || null,
    };
    const result = await notifyCrmSent(chat, notifyConfig);
    if (typeof config.onSync === "function") {
      config.onSync(result, chat);
    }
    return result.ok
      ? { ok: true, groupName, message: "Đã gửi tin và đồng bộ CRM" }
      : { ok: false, error: result.error || "Gửi Zalo OK nhưng CRM chưa đồng bộ — kiểm tra mã sync/chiến dịch" };
  }

  async function handleSendEvent() {
    const config = loadConfig();
    if (config.enabled === false) return null;

    const chat = getActiveChatInfo();
    if (!chat.groupName && !chat.zaloGroupId) return null;

    const dedupeKey = `${normalizeName(chat.groupName)}|${chat.zaloGroupId}`;
    if (shouldSkipDuplicate(dedupeKey)) return null;

    const result = await notifyCrmSent(chat, config);
    if (typeof config.onSync === "function") {
      config.onSync(result, chat);
    }
    return result;
  }

  function bindSendListeners() {
    document.addEventListener(
      "click",
      (event) => {
        if (!isSendClick(event.target)) return;
        setTimeout(() => {
          handleSendEvent().catch(() => {});
        }, 350);
      },
      true,
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (!isComposeEnter(event)) return;
        setTimeout(() => {
          handleSendEvent().catch(() => {});
        }, 350);
      },
      true,
    );
  }

  function updateFloatingDock() {
    let dock = document.getElementById("zalo-crm-dock");
    if (!dock) {
      dock = document.createElement("div");
      dock.id = "zalo-crm-dock";
      dock.style.cssText =
        "position:fixed;bottom:20px;right:20px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font:600 13px Inter,system-ui,sans-serif;pointer-events:none";
      document.body.appendChild(dock);
    }
    const panelOpen = Boolean(document.getElementById("zalo-crm-sync-panel"));
    dock.innerHTML = `
      <button type="button" id="zalo-crm-dock-toggle" title="${panelOpen ? "Ẩn panel CRM" : "Mở panel CRM"}" style="
        pointer-events:auto;
        padding:10px 16px;
        border-radius:999px;
        border:none;
        cursor:pointer;
        font:inherit;
        font-weight:700;
        color:#fff;
        background:${panelOpen ? "#dc2626" : "#2563eb"};
        box-shadow:0 6px 20px rgba(0,0,0,.22);
      ">${panelOpen ? "▲ Ẩn CRM" : "▼ Mở CRM"}</button>
    `;
    dock.querySelector("#zalo-crm-dock-toggle").onclick = () => {
      if (panelOpen) setPanelHidden(true);
      else setPanelHidden(false);
    };
  }

  function setPanelHidden(hidden) {
    const cfg = { ...loadConfig(), panelHidden: Boolean(hidden) };
    saveConfig(cfg);
    if (typeof chrome !== "undefined" && chrome.storage?.sync) {
      chrome.storage.sync.set({ panelHidden: cfg.panelHidden });
    }
    if (hidden) {
      document.getElementById("zalo-crm-sync-panel")?.remove();
    } else {
      renderPanel();
      return;
    }
    updateFloatingDock();
  }

  function renderPanelToggle() {
    updateFloatingDock();
  }

  function renderPanel(options = {}) {
    const panelId = "zalo-crm-sync-panel";
    let panel = document.getElementById(panelId);
    if (panel) panel.remove();

    const cfg = { ...loadConfig(), ...options };
    panel = document.createElement("div");
    panel.id = panelId;
    panel.style.cssText =
      "position:fixed;bottom:64px;right:20px;z-index:2147483646;background:#fff;border:1px solid #cbd5e1;padding:12px;border-radius:12px;box-shadow:0 10px 32px rgba(0,0,0,.18);font:13px Inter,system-ui,sans-serif;max-width:300px;max-height:70vh;overflow:auto";

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px">
        <strong>Zalo CRM</strong>
        <button type="button" id="zcs-close" title="Ẩn panel" style="border:none;background:#fee2e2;color:#b91c1c;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:700">▲ Ẩn</button>
      </div>
      <label style="display:block;font-size:11px;color:#64748b;margin-bottom:4px">URL CRM</label>
      <input id="zcs-crm-url" style="width:100%;margin-bottom:8px;padding:6px;box-sizing:border-box" value="${cfg.crmBaseUrl || (typeof ZALO_CRM_DEFAULT_URL !== "undefined" ? ZALO_CRM_DEFAULT_URL : "https://crm-alpha-henna-85.vercel.app")}" placeholder="https://crm-alpha-henna-85.vercel.app" />
      <label style="display:block;font-size:11px;color:#64748b;margin-bottom:4px">Mã đồng bộ (copy từ CRM)</label>
      <input id="zcs-token" style="width:100%;margin-bottom:8px;padding:6px;box-sizing:border-box" value="${cfg.syncToken || ""}" placeholder="dán mã..." />
      <button id="zcs-scan" style="width:100%;padding:8px 10px;margin-bottom:6px;cursor:pointer;background:#2563eb;color:#fff;border:none;border-radius:6px;font-weight:600">Quét nhóm → gửi CRM</button>
      <button id="zcs-probe" type="button" style="width:100%;padding:6px 10px;margin-bottom:8px;cursor:pointer;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:6px;font-size:12px">Kiểm tra API Zalo</button>
      <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:12px">
        <input type="checkbox" id="zcs-enabled" ${cfg.enabled !== false ? "checked" : ""} /> Tự đánh dấu đã gửi khi gửi tin
      </label>
      <button id="zcs-save" style="padding:8px 10px;margin-right:6px;cursor:pointer;background:#2563eb;color:#fff;border:none;border-radius:6px;font-weight:600">Lưu cấu hình</button>
      <button type="button" id="zcs-hide" style="padding:8px 10px;cursor:pointer;background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;border-radius:6px;font-weight:700">▲ Ẩn CRM</button>
      <span id="zcs-status" style="display:block;font-size:11px;color:#64748b;margin-top:6px"></span>
      <span style="display:block;font-size:10px;color:#94a3b8;margin-top:4px">v1.7.4 · Nút đỏ góc phải dưới = ẩn/hiện</span>
    `;

    document.body.appendChild(panel);
    updateFloatingDock();

    const statusEl = panel.querySelector("#zcs-status");

    panel.querySelector("#zcs-close").onclick = () => setPanelHidden(true);
    panel.querySelector("#zcs-hide").onclick = () => setPanelHidden(true);

    panel.querySelector("#zcs-save").onclick = async () => {
      const next = {
        crmBaseUrl: normalizeCrmBaseUrl(panel.querySelector("#zcs-crm-url").value.trim()),
        syncToken: panel.querySelector("#zcs-token").value.trim(),
        enabled: panel.querySelector("#zcs-enabled").checked,
        campaignId: cfg.campaignId || null,
      };
      panel.querySelector("#zcs-crm-url").value = next.crmBaseUrl;
      saveConfig(next);
      if (typeof chrome !== "undefined" && chrome.storage?.sync) {
        chrome.storage.sync.set({
          crmBaseUrl: next.crmBaseUrl,
          syncToken: next.syncToken,
          enabled: next.enabled,
          campaignId: next.campaignId || "",
        });
      }
      statusEl.style.color = "#64748b";
      statusEl.textContent = "Đang kiểm tra kết nối CRM…";
      try {
        const test = await testCrmConnection(next);
        if (!test.ok) {
          statusEl.textContent = test.error || "Không kết nối được CRM";
          statusEl.style.color = "#dc2626";
          return;
        }
        statusEl.textContent = `✓ Đã lưu — CRM OK (${test.crmBase})`;
        statusEl.style.color = "#16a34a";
        startHeartbeat(next);
        setTimeout(() => setPanelHidden(true), 1500);
      } catch (e) {
        statusEl.textContent = e.message || "Không kết nối được CRM";
        statusEl.style.color = "#dc2626";
      }
    };

    panel.querySelector("#zcs-probe").onclick = async () => {
      const probeBtn = panel.querySelector("#zcs-probe");
      probeBtn.disabled = true;
      statusEl.style.color = "#64748b";
      try {
        const report = await runProbeDiagnostics();
        const parts = [];
        if (report.webpack) {
          parts.push(
            report.groupHit
              ? `nhóm: ${report.groupHit.moduleId}.${report.groupHit.exportName}`
              : "nhóm: không tìm thấy API",
          );
          parts.push(
            report.friendHit
              ? `bạn: ${report.friendHit.moduleId}.${report.friendHit.exportName}`
              : "bạn: không tìm thấy API",
          );
        } else {
          parts.push("không có webpackJsonp");
        }
        parts.push(`API=${report.internalCount}`, `React=${report.reactCount}`, `DOM=${report.domCount}`);
        statusEl.textContent = `Kiểm tra: ${parts.join(" · ")}`;
        statusEl.style.color = report.internalCount > 0 ? "#16a34a" : "#b45309";
      } catch (e) {
        statusEl.textContent = e.message || "Lỗi kiểm tra API";
        statusEl.style.color = "#dc2626";
      } finally {
        probeBtn.disabled = false;
      }
    };

    panel.querySelector("#zcs-scan").onclick = async () => {
      const next = {
        crmBaseUrl: normalizeCrmBaseUrl(panel.querySelector("#zcs-crm-url").value.trim()),
        syncToken: panel.querySelector("#zcs-token").value.trim(),
        enabled: panel.querySelector("#zcs-enabled").checked,
        campaignId: cfg.campaignId || null,
      };
      saveConfig(next);
      const scanBtn = panel.querySelector("#zcs-scan");
      scanBtn.disabled = true;
      statusEl.style.color = "#64748b";
      try {
        const groups = await scanAllGroups({
          onProgress(count, msg) {
            statusEl.textContent = `${msg} (${count})`;
          },
        });
        const result = await pushGroupsScanToCrm(groups, next);
        if (!result.ok) {
          statusEl.textContent = result.error || "Quét thất bại";
          statusEl.style.color = "#dc2626";
          return;
        }
        const c = countChatTypes(groups);
        statusEl.textContent = `✓ CRM: ${c.group} nhóm · ${c.user} cá nhân${c.unknown ? ` · ${c.unknown} chưa rõ` : ""} — bấm «Hiện nhóm vừa quét»`;
        statusEl.style.color = "#16a34a";
      } catch (e) {
        statusEl.textContent = e.message || "Lỗi quét nhóm";
        statusEl.style.color = "#dc2626";
      } finally {
        scanBtn.disabled = false;
      }
    };
  }

  function init(options = {}) {
    if (options.crmBaseUrl || options.syncToken) {
      saveConfig({ ...loadConfig(), ...options });
    }
    const cfg = loadConfig();
    bindSendListeners();
    startHeartbeat(cfg);
    updateFloatingDock();
    const mustSetup = !cfg.syncToken;
    const forceOpen = options.showPanel === true;
    const shouldOpen = forceOpen || (mustSetup && options.showPanel !== false);
    if (shouldOpen) {
      renderPanel(options);
    } else {
      document.getElementById("zalo-crm-sync-panel")?.remove();
      updateFloatingDock();
    }
    return {
      getActiveChatInfo,
      handleSendEvent,
      notifyCrmSent,
      sendHeartbeat,
      autoSendMessage,
      loadConfig,
      saveConfig,
    };
  }

  return {
    init,
    getActiveChatInfo,
    handleSendEvent,
    notifyCrmSent,
    autoSendMessage,
    extractGroupsFromDom,
    detectChatTypeFromDom,
    inferChatTypeFromId,
    fetchChatsFromZaloInternals,
    getWebpackBridge,
    runProbeDiagnostics,
    extractGroupsFromReact,
    countChatTypes,
    scanAllGroups,
    pushGroupsScanToCrm,
    testCrmConnection,
    normalizeCrmBaseUrl,
    sendHeartbeat,
    startHeartbeat,
    loadConfig,
    saveConfig,
    bindSendListeners,
    renderPanel,
    renderPanelToggle,
    updateFloatingDock,
    setPanelHidden,
  };
});
