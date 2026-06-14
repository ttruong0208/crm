// Console Zalo — dán TOÀN BỘ file này vào F12 trên https://chat.zalo.me
// Hoặc (đã cài extension v1.2+): await ZaloCrmWebpack.probeAll()
/* eslint-disable */
(function (root, factory) {
  root.ZaloCrmWebpack = factory();
})(globalThis, function () {
  let webpackFnCache = null;
  const KNOWN = ["Gm1y", "XS0u", "fBUP", "8RMw", "z0WU", "pUq9"];

  function unwrap(result) {
    if (!result) return null;
    if (result.default && typeof result.default === "object" && Object.keys(result.default).length) {
      return result.default;
    }
    return result;
  }

  function loadModule(moduleId) {
    for (const chunk of [window.webpackJsonp, window.webpackChunkzalo_web]) {
      if (!chunk?.push) continue;
      try {
        const mod = unwrap(chunk.push([[Math.random()], {}, [[moduleId]]]));
        if (mod) return mod;
      } catch {}
    }
    return null;
  }

  function moduleIds() {
    const ids = new Set();
    for (const chunk of [window.webpackJsonp, window.webpackChunkzalo_web]) {
      if (!Array.isArray(chunk)) continue;
      for (const entry of chunk) {
        if (entry?.[1]) Object.keys(entry[1]).forEach((id) => ids.add(id));
      }
    }
    return [...ids];
  }

  function findExport(mod, names) {
    if (!mod) return null;
    for (const obj of [mod, mod.default].filter((o) => o && typeof o === "object")) {
      for (const name of names) {
        if (typeof obj[name] === "function") return { fn: obj[name].bind(obj), exportName: name };
      }
    }
    return null;
  }

  function findFn(exportNames) {
    const names = Array.isArray(exportNames) ? exportNames : [exportNames];
    for (const name of names) {
      if (webpackFnCache?.[name]) return webpackFnCache[name];
    }
    for (const moduleId of KNOWN) {
      const hit = findExport(loadModule(moduleId), names);
      if (hit) {
        webpackFnCache = webpackFnCache || {};
        webpackFnCache[hit.exportName] = { ...hit, moduleId };
        return webpackFnCache[hit.exportName];
      }
    }
    let n = 0;
    for (const moduleId of moduleIds()) {
      if (KNOWN.includes(moduleId) || n++ > 2500) continue;
      const hit = findExport(loadModule(moduleId), names);
      if (hit) {
        webpackFnCache = webpackFnCache || {};
        webpackFnCache[hit.exportName] = { ...hit, moduleId };
        return webpackFnCache[hit.exportName];
      }
    }
    return null;
  }

  function mapGroups(raw) {
    const list = Array.isArray(raw) ? raw : raw ? Object.values(raw) : [];
    return list
      .map((g) => {
        const name = String(g?.name || g?.displayName || g?.gName || g?.topic || "").trim();
        let id = String(g?.id ?? g?.groupId ?? g?.grid ?? "").trim();
        if (id && !/^g/i.test(id)) id = `g${id}`;
        if (!name && !id) return null;
        return { name: (name || id).slice(0, 120), zaloGroupId: id, chatType: "group" };
      })
      .filter(Boolean);
  }

  function mapFriends(raw) {
    const list = Array.isArray(raw) ? raw : raw ? Object.values(raw) : [];
    return list
      .map((u) => {
        const name = String(u?.displayName || u?.name || u?.zaloName || "").trim();
        const id = String(u?.userId ?? u?.id ?? u?.uid ?? "").trim();
        if (!name && !id) return null;
        return { name: (name || id).slice(0, 120), zaloGroupId: id, chatType: "user" };
      })
      .filter(Boolean);
  }

  async function fetchChatsFromZaloApi() {
    const items = [];
    const meta = { groupHit: null, friendHit: null, groupCount: 0, friendCount: 0 };
    const gHit = findFn(["getGroupsListSync", "getAllGroups", "getGroupList"]);
    if (gHit) {
      meta.groupHit = { moduleId: gHit.moduleId, exportName: gHit.exportName };
      const mapped = mapGroups(await Promise.resolve(gHit.fn()));
      meta.groupCount = mapped.length;
      items.push(...mapped);
    }
    const fHit = findFn(["getFriends", "getAllFriends", "getFriendList"]);
    if (fHit) {
      meta.friendHit = { moduleId: fHit.moduleId, exportName: fHit.exportName };
      const mapped = mapFriends(await Promise.resolve(fHit.fn()));
      meta.friendCount = mapped.length;
      items.push(...mapped);
    }
    return { items, meta };
  }

  async function probeAll() {
    const chunks = {
      jsonp: !!window.webpackJsonp,
      chunk: !!window.webpackChunkzalo_web,
      moduleIds: moduleIds().length,
    };
    const { items, meta } = await fetchChatsFromZaloApi();
    const result = {
      chunks,
      meta,
      groups: { hit: meta.groupHit, count: meta.groupCount, sample: items.filter((r) => r.chatType === "group").slice(0, 3) },
      friends: { hit: meta.friendHit, count: meta.friendCount, sample: items.filter((r) => r.chatType === "user").slice(0, 3) },
      total: items.length,
    };
    console.log("[Zalo CRM] webpack:", chunks);
    console.log("[Zalo CRM] Groups:", result.groups.hit, "count:", result.groups.count);
    console.log("[Zalo CRM] Friends:", result.friends.hit, "count:", result.friends.count);
    return result;
  }

  return { loadModule, moduleIds, findFn, fetchChatsFromZaloApi, probeAll };
});

window.__ZALO_CRM_DEBUG__ = {
  runAll: () => ZaloCrmWebpack.probeAll(),
  findWebpackFn: ZaloCrmWebpack.findFn,
  probeGroups: async () => {
    const { meta, items } = await ZaloCrmWebpack.fetchChatsFromZaloApi();
    return { hit: meta.groupHit, count: meta.groupCount, sample: items.filter((r) => r.chatType === "group").slice(0, 3) };
  },
  probeFriends: async () => {
    const { meta, items } = await ZaloCrmWebpack.fetchChatsFromZaloApi();
    return { hit: meta.friendHit, count: meta.friendCount, sample: items.filter((r) => r.chatType === "user").slice(0, 3) };
  },
};

console.info("[Zalo CRM] OK — chạy: await ZaloCrmWebpack.probeAll()");
