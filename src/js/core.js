/* 黄昏之门 · 月壤厢 —— 核心命名空间与存档
 * 纯 HTML/JS 无构建：所有脚本挂到全局 DG 命名空间，不用 import/export。
 * file:// 下无 fetch / 无 ES module，数据经 data.js 的全局变量 OC_DATA 注入。
 */
(function (root) {
  var DG = root.DG || (root.DG = {});
  DG.GAME_TITLE = '黄昏之门';
  DG.AREA_NAME = '月壤厢';
  DG.SAVE_PREFIX = 'duskgate_save_';
  DG.SAVE_KEY = DG.SAVE_PREFIX + 'moonseil_v1';
  DG.VERSION = 1;

  DG.util = {
    clamp: function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); },
    /* 可注入 rng 的数组取样，便于 Node 测试 */
    pick: function (arr, rng) {
      var r = rng ? rng() : Math.random();
      return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
    },
    pad2: function (n) { return (n < 10 ? '0' : '') + n; },
    clock: function (d) {
      d = d || new Date();
      return DG.util.pad2(d.getHours()) + ':' + DG.util.pad2(d.getMinutes()) + ':' + DG.util.pad2(d.getSeconds());
    },
    fmt1: function (n) { return (Math.round(n * 10) / 10).toFixed(1); },
    escapeHtml: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
  };

  /* localStorage 守卫：file:// 与 Node（vm）环境下均安全 */
  DG.store = {
    available: function () {
      try { return typeof localStorage !== 'undefined' && !!localStorage; } catch (e) { return false; }
    },
    load: function () {
      if (!DG.store.available()) return null;
      try {
        var raw = localStorage.getItem(DG.SAVE_KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (!data || typeof data !== 'object' || data.v !== DG.VERSION) return null;
        return data;
      } catch (e) { return null; }
    },
    save: function (state) {
      if (!DG.store.available()) return false;
      try {
        state.lastSeen = Date.now();
        localStorage.setItem(DG.SAVE_KEY, JSON.stringify(state));
        return true;
      } catch (e) { return false; }
    },
    clear: function () {
      if (!DG.store.available()) return;
      try { localStorage.removeItem(DG.SAVE_KEY); } catch (e) { /* ignore */ }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
