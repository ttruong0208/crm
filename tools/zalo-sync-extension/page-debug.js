/**
 * Console helper trên chat.zalo.me — cần zalo-webpack.js load trước (world MAIN).
 */
(function () {
  if (window.__ZALO_CRM_DEBUG__) return;
  const W = window.ZaloCrmWebpack;
  if (!W) {
    console.error("[Zalo CRM] Thiếu zalo-webpack.js — reload extension.");
    return;
  }

  window.__ZALO_CRM_DEBUG__ = {
    loadWebpackModule: W.loadWebpackModule,
    getModuleIdsFromChunks: W.getModuleIdsFromChunks,
    findWebpackFn: W.findWebpackFn,
    probeGroups: async () => {
      const { meta, items } = await W.fetchChatsFromZaloApi();
      const sample = items.filter((r) => r.chatType === "group").slice(0, 3);
      return { hit: meta.groupHit, count: meta.groupCount, sample };
    },
    probeFriends: async () => {
      const { meta, items } = await W.fetchChatsFromZaloApi();
      const sample = items.filter((r) => r.chatType === "user").slice(0, 3);
      return { hit: meta.friendHit, count: meta.friendCount, sample };
    },
    runAll: async () => {
      const result = await W.probeAll();
      console.log("[Zalo CRM] webpack:", result.chunks);
      console.log("[Zalo CRM] Groups:", result.groups.hit, "count:", result.groups.count, result.groups.sample);
      console.log("[Zalo CRM] Friends:", result.friends.hit, "count:", result.friends.count, result.friends.sample);
      return result;
    },
  };

  console.info("[Zalo CRM] DevTools OK — gõ: await __ZALO_CRM_DEBUG__.runAll()");
})();
