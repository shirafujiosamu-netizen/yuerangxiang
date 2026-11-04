/* 档案卡 / OC 名录：筛选与收容入口（纯逻辑，无 DOM） */
(function (root) {
  var DG = root.DG || (root.DG = {});

  var YIELD_LABEL = { desc: '描述', mood: '情绪', both: '描述 / 情绪' };

  DG.archive = {
    all: function () {
      return (typeof OC_DATA !== 'undefined' && OC_DATA.units) || [];
    },
    byId: function (id) {
      var list = DG.archive.all();
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },
    worlds: function () {
      return ((typeof OC_DATA !== 'undefined' && OC_DATA.meta && OC_DATA.meta.worlds) || []).map(function (w) {
        return { id: w.id, name: w.name };
      });
    },
    yieldLabel: function (u) { return YIELD_LABEL[u.yield] || u.yield; },
    containedIds: function (s) {
      var ids = {};
      for (var i = 0; i < s.cells.length; i++) if (s.cells[i].unitId) ids[s.cells[i].unitId] = true;
      return ids;
    },
    /* opts: {world: '全部世界'|世界名, rarity: '全部'|SSR|SR|R|DISASTER} */
    filter: function (s, opts) {
      opts = opts || {};
      var contained = DG.archive.containedIds(s);
      var rank = { SSR: 0, SR: 1, DISASTER: 2, R: 3 };
      return DG.archive.all()
        .filter(function (u) {
          if (opts.world && opts.world !== '全部世界' && u.world !== opts.world) return false;
          if (opts.rarity && opts.rarity !== '全部' && u.rarity !== opts.rarity) return false;
          return true;
        })
        .map(function (u) {
          return { unit: u, contained: !!contained[u.id] };
        })
        .sort(function (a, b) {
          var ra = rank[a.unit.rarity], rb = rank[b.unit.rarity];
          if (ra !== rb) return ra - rb;
          if (b.unit.yieldRate !== a.unit.yieldRate) return b.unit.yieldRate - a.unit.yieldRate;
          return a.unit.name < b.unit.name ? -1 : 1;
        });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
