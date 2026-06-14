/**
 * Zalo Web webpack bridge — quét module ID trong bộ nhớ, load từng module (không dùng require.push).
 * Dùng chung: extension content script + page-debug (MAIN world).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ZaloCrmWebpack = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  let webpackFnCache = null;
  const KNOWN_WEBPACK_MODULE_IDS = ["Gm1y", "XS0u", "fBUP", "8RMw", "z0WU", "pUq9"];

  function unwrapWebpackModule(result) {
    if (!result) return null;
    if (result.default && typeof result.default === "object" && Object.keys(result.default).length) {
      return result.default;
    }
    return result;
  }

  function loadWebpackModule(moduleId) {
    for (const chunk of [window.webpackJsonp, window.webpackChunkzalo_web]) {
      if (!chunk?.push) continue;
      try {
        const result = chunk.push([[Math.random()], {}, [[moduleId]]]);
        const mod = unwrapWebpackModule(result);
        if (mod) return mod;
      } catch {
        // thử chunk khác
      }
    }
    return null;
  }

  function getModuleIdsFromChunks() {
    const ids = new Set();
    for (const chunk of [window.webpackJsonp, window.webpackChunkzalo_web]) {
      if (!Array.isArray(chunk)) continue;
      for (const entry of chunk) {
        if (!Array.isArray(entry) || !entry[1] || typeof entry[1] !== "object") continue;
        for (const id of Object.keys(entry[1])) ids.add(id);
      }
    }
    return [...ids];
  }

  function findExportOnModule(mod, names) {
    if (!mod) return null;
    const objs = [mod];
    if (mod.default && typeof mod.default === "object") objs.push(mod.default);
    for (const obj of objs) {
      for (const name of names) {
        if (typeof obj[name] === "function") {
          return { fn: obj[name].bind(obj), exportName: name };
        }
      }
    }
    return null;
  }

  function findWebpackFn(exportNames) {
    const names = Array.isArray(exportNames) ? exportNames : [exportNames];
    if (webpackFnCache) {
      for (const name of names) {
        if (webpackFnCache[name]) return webpackFnCache[name];
      }
    }

    for (const moduleId of KNOWN_WEBPACK_MODULE_IDS) {
      const hit = findExportOnModule(loadWebpackModule(moduleId), names);
      if (hit) {
        const full = { ...hit, moduleId };
        webpackFnCache = webpackFnCache || {};
        webpackFnCache[hit.exportName] = full;
        return full;
      }
    }

    const moduleIds = getModuleIdsFromChunks();
    let scanned = 0;
    for (const moduleId of moduleIds) {
      if (KNOWN_WEBPACK_MODULE_IDS.includes(moduleId)) continue;
      if (scanned++ > 2500) break;
      try {
        const hit = findExportOnModule(loadWebpackModule(moduleId), names);
        if (hit) {
          const full = { ...hit, moduleId };
          webpackFnCache = webpackFnCache || {};
          webpackFnCache[hit.exportName] = full;
          return full;
        }
      } catch {
        // ignore
      }
    }
    return null;
  }

  function mapGroupRecords(raw) {
    const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
    const items = [];
    list.forEach((g) => {
      const name = String(g?.name || g?.displayName || g?.gName || g?.topic || g?.fullName || "").trim();
      let id = String(g?.id ?? g?.groupId ?? g?.globalId ?? g?.grid ?? "").trim();
      if (id && !/^g/i.test(id)) id = `g${id}`;
      if (!name && !id) return;
      items.push({
        name: (name || id).slice(0, 120),
        zaloGroupId: id,
        owner: "",
        chatType: "group",
      });
    });
    return items;
  }

  function mapUserRecords(raw) {
    const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
    const items = [];
    list.forEach((u) => {
      const name = String(u?.displayName || u?.name || u?.zaloName || u?.fullName || "").trim();
      const id = String(u?.userId ?? u?.id ?? u?.uid ?? u?.user_id ?? "").trim();
      if (!name && !id) return;
      items.push({
        name: (name || id).slice(0, 120),
        zaloGroupId: id,
        owner: "",
        chatType: "user",
      });
    });
    return items;
  }

  async function fetchChatsFromZaloApi() {
    const items = [];
    const meta = {
      webpackJsonp: Boolean(window.webpackJsonp),
      webpackChunk: Boolean(window.webpackChunkzalo_web),
      moduleIdsInMemory: getModuleIdsFromChunks().length,
      groupHit: null,
      friendHit: null,
      groupCount: 0,
      friendCount: 0,
    };

    const groupHit = findWebpackFn(["getGroupsListSync", "getAllGroups", "getGroupList"]);
    if (groupHit) {
      meta.groupHit = { moduleId: groupHit.moduleId, exportName: groupHit.exportName };
      try {
        const raw = await Promise.resolve(groupHit.fn());
        const mapped = mapGroupRecords(raw);
        meta.groupCount = mapped.length;
        items.push(...mapped);
      } catch {
        // ignore
      }
    }

    const friendHit = findWebpackFn(["getFriends", "getAllFriends", "getFriendList"]);
    if (friendHit) {
      meta.friendHit = { moduleId: friendHit.moduleId, exportName: friendHit.exportName };
      try {
        const raw = await Promise.resolve(friendHit.fn());
        const mapped = mapUserRecords(raw);
        meta.friendCount = mapped.length;
        items.push(...mapped);
      } catch {
        // ignore
      }
    }

    return { items, meta };
  }

  async function probeAll() {
    const chunks = {
      jsonp: Boolean(window.webpackJsonp),
      chunk: Boolean(window.webpackChunkzalo_web),
      moduleIds: getModuleIdsFromChunks().length,
    };
    const { items, meta } = await fetchChatsFromZaloApi();
    const groups = items.filter((r) => r.chatType === "group");
    const friends = items.filter((r) => r.chatType === "user");
    return {
      chunks,
      meta,
      groups: { hit: meta.groupHit, count: groups.length, sample: groups.slice(0, 3) },
      friends: { hit: meta.friendHit, count: friends.length, sample: friends.slice(0, 3) },
      total: items.length,
    };
  }

  return {
    KNOWN_WEBPACK_MODULE_IDS,
    loadWebpackModule,
    getModuleIdsFromChunks,
    findWebpackFn,
    mapGroupRecords,
    mapUserRecords,
    fetchChatsFromZaloApi,
    probeAll,
  };
});
