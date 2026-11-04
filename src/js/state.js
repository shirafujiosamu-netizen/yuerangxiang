/* 游戏状态：收容 / 资源产出 / tick 推进 / 离线补算（纯逻辑，无 DOM）
 * 时间基准：所有 haltedUntil / suppressUntil / lastSeen 均为 epoch 毫秒。
 */
(function (root) {
  var DG = root.DG || (root.DG = {});

  /* 稀有度对产出与污染的倍率（DISASTER 正式分级表待数值成员定，先按 TODO 处理） */
  DG.RARITY_MULT = { R: 1, SR: 1.25, SSR: 1.5, DISASTER: 2 };
  DG.RARITY_ORDER = ['SSR', 'SR', 'DISASTER', 'R']; /* 仅用于名录排序展示 */
  DG.BASE_CELLS = 6;
  DG.MAX_CELLS = 11;
  /* 污染缩放系数：正式值 0.03（docs/balance.md 污染模型，3×R 参考路径首次失效约 18.5 分钟）。
   * 挂命名空间供 pollution.js 与 ui.js 共同引用，杜绝多处漂移。 */
  DG.POLLUTION_SCALE = 0.03;   /* 单位 pollution -> 每秒污染度 */
  var OFFLINE_CAP = 7200;          /* 离线补算封顶 2 小时 */
  var OFFLINE_EFF = 0.5;           /* 离线 50% 效率 */

  function unitById(id) {
    var list = (typeof OC_DATA !== 'undefined' && OC_DATA.units) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  DG.state_unitById = unitById;

  function blankCell() { return { unitId: null, rarity: null, haltedUntil: 0, containedAt: 0 }; }
  DG.state_blankCell = blankCell;

  DG.state = {
    blankCell: blankCell,
    createInitial: function () {
      var cells = [];
      for (var i = 0; i < DG.BASE_CELLS; i++) cells.push(blankCell());
      return {
        v: DG.VERSION,
        desc: 10,
        mood: 10,
        pollution: 0,
        suppressUntil: 0,
        breachGraceUntil: 0,
        completedUntil: 0,   /* Eidos「完成」debuff 截止时刻：期间全场产出减半 */
        eventDebuffUntil: 0, /* 事件 debuff（如讨债人常驻）截止时刻 */
        nextFreeRound: false,/* 事件 buff：下一局赌注免费 */
        cells: cells,
        skills: {},
        /* 角色关系值（事件系统写入；陪玩事件解锁与结局分支的门槛） */
        bonds: { eidos: 0 },
        /* 店主视角：营业日 / 账本 / 口碑（docs/owner_design.md 一期，见 house.js） */
        casino2: { phase: 'night', day: 1, rounds: 0, reputation: 50, perTable: {}, ledger: [] },
        lastEventRound: 0,     /* 上一次事件触发的局数（触发间隔控制） */
        lastEventIds: [],      /* 最近触发过的事件 id（防重复） */
        stats: { contained: 0, failures: 0, removed: 0, rounds: 0, wins: 0, lossStreak: 0 },
        lastSeen: Date.now()
      };
    },

    /* 读档后的最小迁移校验：缺字段补默认值 */
    migrate: function (s) {
      if (!s || typeof s !== 'object') return DG.state.createInitial();
      var def = DG.state.createInitial();
      for (var k in def) if (s[k] === undefined) s[k] = def[k];
      if (!Array.isArray(s.cells)) s.cells = def.cells;
      if (!s.skills || typeof s.skills !== 'object') s.skills = {};
      if (!s.stats || typeof s.stats !== 'object') s.stats = def.stats;
      s.cells = s.cells.map(function (c) {
        if (!c || !c.unitId) return blankCell();
        return {
          unitId: c.unitId,
          rarity: DG.RARITY_MULT[c.rarity] ? c.rarity : (unitById(c.unitId) || {}).rarity || 'R',
          haltedUntil: c.haltedUntil | 0,
          containedAt: c.containedAt | 0
        };
      });
      s.cells = s.cells.slice(0, DG.MAX_CELLS);
      return s;
    },

    freeCellIndex: function (s) {
      for (var i = 0; i < s.cells.length; i++) if (!s.cells[i].unitId) return i;
      return -1;
    },

    isContained: function (s, unitId) {
      for (var i = 0; i < s.cells.length; i++) if (s.cells[i].unitId === unitId) return true;
      return false;
    },

    /* 收容：返回 {ok, cellIndex, err} */
    contain: function (s, unitId, now) {
      now = now || Date.now();
      var u = unitById(unitId);
      if (!u) return { ok: false, err: '名录中不存在该单位' };
      if (DG.state.isContained(s, unitId)) return { ok: false, err: '该单位已在驻' };
      var idx = DG.state.freeCellIndex(s);
      if (idx < 0) return { ok: false, err: '没有空闲收容格（技能树可扩建）' };
      s.cells[idx] = { unitId: unitId, rarity: u.rarity, haltedUntil: 0, containedAt: now };
      s.stats.contained++;
      return { ok: true, cellIndex: idx };
    },

    /* 主动调离（逃逸 removal 由污染失效事件触发，见 pollution.js） */
    removeAt: function (s, idx) {
      if (idx < 0 || idx >= s.cells.length || !s.cells[idx].unitId) return { ok: false, err: '该格为空' };
      var id = s.cells[idx].unitId;
      s.cells[idx] = blankCell();
      s.stats.removed++;
      return { ok: true, unitId: id };
    },

    isHalted: function (s, cell, now) { return !!cell && cell.haltedUntil > now; },

    /* 单个收容格每秒产出 */
    unitOutput: function (s, cell, now) {
      var out = { desc: 0, mood: 0 };
      if (!cell || !cell.unitId) return out;
      if (DG.state.isHalted(s, cell, now || Date.now())) return out;
      var u = unitById(cell.unitId);
      if (!u) return out;
      var mods = DG.skills ? DG.skills.modifiers(s) : { descMult: 1, moodMult: 1 };
      var m = DG.RARITY_MULT[cell.rarity] || 1;
      var rate = u.yieldRate * m;
      if (u.yield === 'desc') out.desc = rate * mods.descMult;
      else if (u.yield === 'mood') out.mood = rate * mods.moodMult;
      else { /* both：对半拆分 */
        out.desc = rate * 0.5 * mods.descMult;
        out.mood = rate * 0.5 * mods.moodMult;
      }
      /* 「完成」debuff：连输至极点被 Eidos 完成——完美，但不再说话。产出减半。 */
      if ((s.completedUntil || 0) > now) { out.desc *= 0.5; out.mood *= 0.5; }
      return out;
    },

    outputPerSecond: function (s, now) {
      var total = { desc: 0, mood: 0 };
      now = now || Date.now();
      for (var i = 0; i < s.cells.length; i++) {
        var o = DG.state.unitOutput(s, s.cells[i], now);
        total.desc += o.desc;
        total.mood += o.mood;
      }
      return total;
    },

    /* 推进 seconds 秒。opts.efficiency 用于离线折半。
     * 返回 {descGain, moodGain, breach}；breach=true 表示本次推进跨越了污染 100。 */
    tick: function (s, seconds, now, opts) {
      now = now || Date.now();
      opts = opts || {};
      var eff = opts.efficiency == null ? 1 : opts.efficiency;
      var gain = DG.state.outputPerSecond(s, now);
      var dg = gain.desc * seconds * eff;
      var mg = gain.mood * seconds * eff;
      s.desc += dg;
      s.mood += mg;
      var rate = DG.pollution.rate(s, now);
      var before = s.pollution;
      s.pollution += rate * seconds * eff;
      var breach = false;
      if (before < 100 && s.pollution >= 100 && now >= (s.breachGraceUntil || 0)) breach = true;
      s.lastSeen = now;
      return { descGain: dg, moodGain: mg, breach: breach };
    },

    /* 离线补算：按 lastSeen 至今的时长，50% 效率、封顶 2 小时，逐秒模拟。
     * 返回汇总（供 UI 弹窗）。离线期间最多触发一次收容失效。 */
    applyOffline: function (s, now, rng) {
      now = now || Date.now();
      rng = rng || Math.random;
      var t0 = s.lastSeen || now;
      var elapsed = Math.max(0, Math.floor((now - t0) / 1000));
      var secs = Math.min(elapsed, OFFLINE_CAP);
      var capped = elapsed > OFFLINE_CAP;
      var sum = { desc: 0, mood: 0, seconds: secs, skipped: elapsed - secs, capped: capped, failure: null };
      if (secs <= 0) { s.lastSeen = now; return sum; }
      var failureDone = false;
      for (var i = 0; i < secs; i++) {
        var vnow = t0 + i * 1000;
        var r = DG.state.tick(s, 1, vnow, { efficiency: OFFLINE_EFF });
        sum.desc += r.descGain;
        sum.mood += r.moodGain;
        if (r.breach && !failureDone) {
          sum.failure = DG.pollution.resolveFailure(s, vnow, rng);
          failureDone = true;
        }
      }
      s.lastSeen = now;
      return sum;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
