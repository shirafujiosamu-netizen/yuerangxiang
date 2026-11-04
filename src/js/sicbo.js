/* 骰宝（Sic Bo）：三粒骰子，Eidos 公平化赔率（纯逻辑，无 DOM）
 * 说明：传统澳门骰宝 specific 注（点数/对子/围骰）用整数赔率，抽水高达 12%-30%；
 * Eidos 人设「赔率永远公平」+ 数值锚 1%-6%，故按 216 组合精确枚举反解赔率：
 *   x = 207.36/n - 1（n=组合数，目标抽水 2.78%~4.17%），允许 .5/.75 档（同 21 点 3:2）。
 * 赔率表（payout = 净赔倍数，本金另退）：
 *   大/小      1:1      11-17 / 4-10，围骰通杀（-2.78%）
 *   点数       68/34/20/13/9/7.5/6.75:1  总和（-1.62% ~ -4.17%）
 *   单骰       出现 1 次 1:1 / 2 次 2:1 / 3 次 12:1（-3.70%）
 *   对子       任意两骰同点（非围骰）13:1（-2.78%）
 *   围骰       三骰同点 206:1（-4.17%）
 *   组合       指定两点数各至少出现一次 6:1（-2.78%）
 * 216 组合精确枚举 + 蒙特卡洛双重验证（见 tests）。
 */
(function (root) {
  var DG = root.DG || (root.DG = {});

  /* 点数赔率表（总和 → 净赔倍数）。n=组合数：4/17→3, 5/16→6, 6/15→10, 7/14→15,
   * 8/13→21, 9/12→25, 10/11→27。x=207.36/n-1（抽水≈4.17% 或 2.78%） */
  var TOTAL_PAY = { 4: 68, 5: 34, 6: 20, 7: 13, 8: 9, 9: 7.5, 10: 6.75, 11: 6.75, 12: 7.5, 13: 9, 14: 13, 15: 20, 16: 34, 17: 68 };
  var SINGLE_PAY = { 1: 1, 2: 2, 3: 12 };  /* 出现次数 → 净赔倍数（三次 12:1） */
  var PAIR_PAY = 13;       /* 对子（非围骰）：n=15，13:1 → -2.78% */
  var TRIPLE_PAY = 206;    /* 围骰：n=1，206:1 → -4.17% */
  var COMBO_PAY = 6;       /* 组合：n=30，6:1 → -2.78% */

  /* 掷三骰。rng 可注入。 */
  function rollDice(rng) {
    rng = rng || Math.random;
    var d = [Math.floor(rng() * 6) + 1, Math.floor(rng() * 6) + 1, Math.floor(rng() * 6) + 1];
    var total = d[0] + d[1] + d[2];
    return { d: d.slice(), total: total };
  }

  function isTriple(roll) { return roll.d[0] === roll.d[1] && roll.d[1] === roll.d[2]; }
  function countOf(roll, v) { return roll.d.filter(function (x) { return x === v; }).length; }

  /* 投注 id 构造与解析：
   * big / small / total:N / single:N / pair:N / triple:N / combo:N:M */
  function betId(type, a, b) {
    if (type === 'combo') return 'combo:' + a + ':' + b;
    if (a != null) return type + ':' + a;
    return type;
  }

  /* 投注区定义（UI 渲染用） */
  var AREAS = [
    { id: 'big',    label: '大 (11-17)', note: '1:1 · 围骰通杀' },
    { id: 'small',  label: '小 (4-10)',  note: '1:1 · 围骰通杀' }
  ];
  for (var t = 4; t <= 17; t++) {
    AREAS.push({ id: 'total:' + t, label: String(t), note: TOTAL_PAY[t] + ':1' });
  }
  for (var f = 1; f <= 6; f++) {
    AREAS.push({ id: 'single:' + f, label: '单' + f,
      note: '1/2/3 次 ' + SINGLE_PAY[1] + ':1/' + SINGLE_PAY[2] + ':1/' + SINGLE_PAY[3] + ':1' });
  }
  for (var p = 1; p <= 6; p++) {
    AREAS.push({ id: 'pair:' + p, label: '对' + p, note: PAIR_PAY + ':1' });
    AREAS.push({ id: 'triple:' + p, label: '围' + p, note: TRIPLE_PAY + ':1' });
  }
  var combos = [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6]];
  combos.forEach(function (c) {
    AREAS.push({ id: 'combo:' + c[0] + ':' + c[1], label: c[0] + '+' + c[1], note: COMBO_PAY + ':1' });
  });

  function areaOf(id) {
    for (var i = 0; i < AREAS.length; i++) if (AREAS[i].id === id) return AREAS[i];
    return null;
  }

  /* 单个投注在某一掷的结果：返回 {hit, mult}（mult=净赔倍数，0 为未中） */
  function evalBet(id, roll) {
    var parts = id.split(':'), type = parts[0];
    var d = roll.d, total = roll.total;
    if (type === 'big')   return { hit: !isTriple(roll) && total >= 11 && total <= 17, mult: 1 };
    if (type === 'small') return { hit: !isTriple(roll) && total >= 4 && total <= 10, mult: 1 };
    if (type === 'total') return { hit: total === +parts[1], mult: TOTAL_PAY[+parts[1]] || 0 };
    if (type === 'single') {
      var c = countOf(roll, +parts[1]);
      return { hit: c > 0, mult: c > 0 ? SINGLE_PAY[c] : 0 };
    }
    if (type === 'pair') {
      if (isTriple(roll)) return { hit: false, mult: 0 };
      return { hit: countOf(roll, +parts[1]) >= 2, mult: PAIR_PAY };
    }
    if (type === 'triple') return { hit: isTriple(roll) && d[0] === +parts[1], mult: TRIPLE_PAY };
    if (type === 'combo') {
      return { hit: countOf(roll, +parts[1]) >= 1 && countOf(roll, +parts[2]) >= 1, mult: COMBO_PAY };
    }
    return { hit: false, mult: 0 };
  }

  /* 结算：bets = [{id, stake}]。返回明细与净额（赌注已在开局扣除，returned 含本金）。 */
  function settle(bets, roll) {
    var staked = 0, returned = 0, details = [];
    for (var i = 0; i < bets.length; i++) {
      var b = bets[i], st = b.stake || 0;
      if (st <= 0) continue;
      var r = evalBet(b.id, roll);
      staked += st;
      var pay = r.hit ? st + st * r.mult : 0;
      returned += pay;
      details.push({ id: b.id, stake: st, hit: r.hit, mult: r.mult, paid: pay });
    }
    return { staked: staked, returned: returned, net: returned - staked, details: details, roll: roll };
  }

  DG.sicbo = {
    TOTAL_PAY: TOTAL_PAY, SINGLE_PAY: SINGLE_PAY, PAIR_PAY: PAIR_PAY,
    TRIPLE_PAY: TRIPLE_PAY, COMBO_PAY: COMBO_PAY,
    AREAS: AREAS, rollDice: rollDice, betId: betId, areaOf: areaOf,
    evalBet: evalBet, settle: settle, isTriple: isTriple, countOf: countOf
  };
})(typeof window !== 'undefined' ? window : globalThis);
