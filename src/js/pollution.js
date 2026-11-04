/* 污染度 / 压制 / 收容失效事件（纯逻辑，无 DOM）
 * 文案基调：档案式平静 + 偶尔残忍（「备注：灭门」）。
 */
(function (root) {
  var DG = root.DG || (root.DG = {});

  var SUPPRESS_COST = 20;      /* 压制消耗 情绪 */
  var SUPPRESS_DROP = 25;      /* 压制瞬间降低污染度 */
  var SUPPRESS_TIME = 30000;   /* 压制持续 30 秒，期间污染增速减半 */
  var HALT_SECONDS = 60;       /* 失效事件：产出冻结时长 */
  var BREACH_RESET = 35;       /* 失效事件后污染回落 */
  var BREACH_GRACE = 30000;    /* 失效事件后 30 秒宽限期，不会连续触发 */
  /* 失效结果权重（docs/balance.md 正式值）：冻结 40% / 降级 30% / 逃逸 30%。
   * 冻结权重高于旧值 34%：demo 首次失效给玩家呼吸空间，灭门仍是三成真实恐惧。 */
  var FAIL_HALT = 0.40;
  var FAIL_DROP = 0.30;

  function unitById(id) {
    var list = (typeof OC_DATA !== 'undefined' && OC_DATA.units) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* 当前每秒污染度增量（含技能修正、压制减半、冻结格减半、自然衰减） */
  DG.pollution = {
    rate: function (s, now) {
      now = now || Date.now();
      var mods = DG.skills ? DG.skills.modifiers(s) : { pollutionMult: 1, decay: 0 };
      var sum = 0;
      for (var i = 0; i < s.cells.length; i++) {
        var c = s.cells[i];
        if (!c.unitId) continue;
        var u = unitById(c.unitId);
        if (!u) continue;
        var m = DG.RARITY_MULT[c.rarity] || 1;
        if (c.haltedUntil > now) m *= 0.5; /* 冻结单位污染贡献减半 */
        sum += u.pollution * m;
      }
      var rate = sum * DG.POLLUTION_SCALE * mods.pollutionMult;
      if (now < (s.suppressUntil || 0)) rate *= 0.5;
      rate -= mods.decay;
      return Math.max(0, rate);
    },

    isSuppressed: function (s, now) { return now < (s.suppressUntil || 0); },

    /* 压制：消耗情绪，瞬间降污染 + 一段时间增速减半 */
    suppress: function (s, now) {
      now = now || Date.now();
      if (s.mood < SUPPRESS_COST) return { ok: false, err: '情绪不足（需要 ' + SUPPRESS_COST + '）' };
      var mods = DG.skills ? DG.skills.modifiers(s) : { suppressPower: SUPPRESS_DROP, suppressDuration: SUPPRESS_TIME };
      s.mood -= SUPPRESS_COST;
      var before = s.pollution;
      s.pollution = Math.max(0, s.pollution - mods.suppressPower);
      s.suppressUntil = now + mods.suppressDuration;
      return { ok: true, before: before, after: s.pollution, until: s.suppressUntil };
    },

    /* 污染满 100 触发一次收容失效。返回事件对象（UI 弹窗用）。 */
    resolveFailure: function (s, now, rng) {
      now = now || Date.now();
      rng = rng || Math.random;
      var mods = DG.skills ? DG.skills.modifiers(s) : { breachReset: BREACH_RESET, breachGrace: BREACH_GRACE };

      /* 候选：在驻且未被冻结的单位，按污染值加权 */
      var cand = [];
      for (var i = 0; i < s.cells.length; i++) {
        var c = s.cells[i];
        if (!c.unitId || c.haltedUntil > now) continue;
        var u = unitById(c.unitId);
        if (!u) continue;
        cand.push({ idx: i, cell: c, unit: u, w: u.pollution * (DG.RARITY_MULT[c.rarity] || 1) });
      }
      var ev = {
        ok: cand.length > 0,
        unitId: null, name: '', archetype: '', serial: '—',
        outcome: 'none', oldRarity: null, newRarity: null,
        reset: mods.breachReset, grace: mods.breachGrace,
        lines: []
      };
      if (!cand.length) {
        /* 全员冻结等极端情况：仅回落污染 */
        s.pollution = mods.breachReset;
        s.breachGraceUntil = now + mods.breachGrace;
        ev.lines = ['污染度达到阈值，但厢体内无可处置对象。', '污染度已强制回落至 ' + mods.breachReset + '。'];
        return ev;
      }

      var total = 0;
      for (var j = 0; j < cand.length; j++) total += cand[j].w;
      var roll = rng() * total, pick = cand[cand.length - 1];
      for (var k = 0; k < cand.length; k++) {
        roll -= cand[k].w;
        if (roll <= 0) { pick = cand[k]; break; }
      }

      var serial = '№' + ('00' + (pick.idx + 1)).slice(-3);
      ev.unitId = pick.unit.id;
      ev.name = pick.unit.name;
      ev.archetype = pick.unit.archetype;
      ev.serial = serial;

      /* 结果判定：冻结 / 降级 / 逃逸。DISASTER 无法处置，直接逃逸 */
      var r = rng(), outcome;
      if (pick.cell.rarity === 'DISASTER') outcome = 'escape';
      else if (r < FAIL_HALT) outcome = 'halt';
      else if (r < FAIL_HALT + FAIL_DROP) outcome = pick.cell.rarity === 'R' ? 'escape' : 'drop';
      else outcome = 'escape';
      ev.outcome = outcome;

      if (outcome === 'halt') {
        pick.cell.haltedUntil = now + HALT_SECONDS * 1000;
        ev.lines = [
          '「' + pick.unit.name + '」（' + pick.unit.archetype + '）于本时段发生扩散。',
          '处置决定：冻结其产出 ' + HALT_SECONDS + ' 秒。档案维持原样。',
          '本次事件后，污染度回落至 ' + mods.breachReset + '，进入 ' + (mods.breachGrace / 1000) + ' 秒宽限期。'
        ];
      } else if (outcome === 'drop') {
        ev.oldRarity = pick.cell.rarity;
        ev.newRarity = pick.cell.rarity === 'SSR' ? 'SR' : 'R';
        pick.cell.rarity = ev.newRarity;
        ev.lines = [
          '「' + pick.unit.name + '」（' + pick.unit.archetype + '）于本时段发生扩散。',
          '处置决定：稀有度由 ' + ev.oldRarity + ' 下调至 ' + ev.newRarity + '。备注：降级。',
          '本次事件后，污染度回落至 ' + mods.breachReset + '，进入 ' + (mods.breachGrace / 1000) + ' 秒宽限期。'
        ];
      } else {
        s.cells[pick.idx] = { unitId: null, rarity: null, haltedUntil: 0, containedAt: 0 };
        s.stats.removed++;
        ev.lines = [
          '「' + pick.unit.name + '」（' + pick.unit.archetype + '）于本时段发生扩散。',
          '处置决定：执行灭门。备注：灭门。',
          '该单位已不在册。污染度回落至 ' + mods.breachReset + '。'
        ];
      }

      s.pollution = mods.breachReset;
      s.breachGraceUntil = now + mods.breachGrace;
      s.stats.failures++;
      return ev;
    },

    CONSTANTS: { SUPPRESS_COST: SUPPRESS_COST, SUPPRESS_DROP: SUPPRESS_DROP, SUPPRESS_TIME: SUPPRESS_TIME, HALT_SECONDS: HALT_SECONDS, BREACH_RESET: BREACH_RESET, BREACH_GRACE: BREACH_GRACE, FAIL_HALT: FAIL_HALT, FAIL_DROP: FAIL_DROP }
  };
})(typeof window !== 'undefined' ? window : globalThis);
