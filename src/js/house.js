/* 营业日（店主视角一期）：账本 / 口碑 / 打烊
 * 纯逻辑，无 DOM；一期只搭骨架，不做客流参数闭环（见 docs/owner_design.md 六、一期）。
 *
 * 视角前提：玩家是 Eidos 托付的代理店主，可以亲自下场。一「日」= 固定局数（8 局），
 * 打满进打烊相位，看当日账本与口碑。不引入新货币，营收仍走 desc / mood。
 */
(function (root) {
  var DG = root.DG || (root.DG = {});
  var DAY_ROUNDS = 8;
  var REP_START = 50;

  function ensure(s) {
    if (!s.casino2 || typeof s.casino2 !== 'object') {
      s.casino2 = {
        phase: 'night', day: 1, rounds: 0,
        reputation: REP_START, perTable: {}, ledger: []
      };
    }
    var h = s.casino2;
    if (h.phase !== 'night' && h.phase !== 'prep') h.phase = 'night';
    if (typeof h.day !== 'number' || h.day < 1) h.day = 1;
    if (typeof h.rounds !== 'number' || h.rounds < 0) h.rounds = 0;
    if (typeof h.reputation !== 'number') h.reputation = REP_START;
    if (!h.perTable || typeof h.perTable !== 'object') h.perTable = {};
    if (!Array.isArray(h.ledger)) h.ledger = [];
    return h;
  }

  function repAdd(s, delta) {
    var h = ensure(s);
    h.reputation = Math.max(0, Math.min(100, Math.round(h.reputation + delta)));
    return h.reputation;
  }

  function tableRow(h, table) {
    if (!h.perTable[table]) h.perTable[table] = { rounds: 0, net: 0 };
    return h.perTable[table];
  }

  /* 记一局：table 为赌桌 id，net 为该局对玩家的净额（正是赢、负是输）。
   * 满 DAY_ROUNDS 局自动打烊，返回 { closed, summary }。 */
  function recordRound(s, table, net) {
    var h = ensure(s);
    if (h.phase !== 'night') return { closed: false, phase: h.phase };
    var row = tableRow(h, table);
    row.rounds++;
    row.net += (net || 0);
    h.rounds++;
    if (h.rounds < DAY_ROUNDS) return { closed: false, phase: 'night' };
    return { closed: true, phase: 'prep', summary: closeDay(s) };
  }

  /* 打烊结算：算口碑、写账本、切相位。幂等（已打烊不重复记）。 */
  function closeDay(s) {
    var h = ensure(s);
    if (h.phase !== 'night') return h.ledger[h.ledger.length - 1] || null;
    var net = 0, rounds = 0;
    for (var k in h.perTable) {
      if (!Object.prototype.hasOwnProperty.call(h.perTable, k)) continue;
      net += h.perTable[k].net;
      rounds += h.perTable[k].rounds;
    }
    /* 口碑：打满全场 +1；当日净正再 +1，净负 -1；夹在 ±2 内 */
    var delta = 1 + (net > 0 ? 1 : (net < 0 ? -1 : 0));
    if (delta > 2) delta = 2;
    if (delta < -2) delta = -2;
    var before = h.reputation;
    h.reputation = Math.max(0, Math.min(100, Math.round(before + delta)));
    var entry = {
      day: h.day, rounds: rounds, net: net,
      perTable: JSON.parse(JSON.stringify(h.perTable)),
      repBefore: before, repAfter: h.reputation, repDelta: h.reputation - before
    };
    h.ledger.push(entry);
    if (h.ledger.length > 30) h.ledger.shift();
    h.phase = 'prep';
    return entry;
  }

  /* 开门：进下一日，清空当日流水。 */
  function nextDay(s) {
    var h = ensure(s);
    h.day++;
    h.rounds = 0;
    h.perTable = {};
    h.phase = 'night';
    return h;
  }

  DG.house = {
    DAY_ROUNDS: DAY_ROUNDS,
    REP_START: REP_START,
    ensure: ensure,
    recordRound: recordRound,
    closeDay: closeDay,
    nextDay: nextDay,
    repAdd: repAdd,
    isClosed: function (s) { return ensure(s).phase !== 'night'; },
    todayNet: function (s) {
      var h = ensure(s), net = 0;
      for (var k in h.perTable) if (Object.prototype.hasOwnProperty.call(h.perTable, k)) net += h.perTable[k].net;
      return net;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
