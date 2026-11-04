/* 轮盘（Roulette）规则内核——Eidos 赌场（纯逻辑，无 DOM，可 node 测试）
 * 规则基线：欧式单零轮盘（0-36；0 为绿色，红黑各 18）。
 * 投注区：直号 straight（35:1）/ 红黑奇偶大小（1:1）/ 打数 dozen（2:1）/ 列 col（2:1）。
 * 理论回报率 36/37 ≈ 97.30%，庄家优势 2.70%（单零抽水），蒙特卡洛验证见测试。
 * Eidos 化：0 落袋 = 「万物归一者」——外围注全灭，只有直号 0 通吃。
 */
(function (root) {
  var DG = root.DG || (root.DG = {});
  if (!DG.roulette) DG.roulette = {};

  var RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

  /* 赔率表（净赔 : 1）。直号 35；外围 1；打数/列 2。 */
  var ODDS = {
    'straight': 35,
    'red': 1, 'black': 1, 'odd': 1, 'even': 1, 'low': 1, 'high': 1,
    'dozen:1': 2, 'dozen:2': 2, 'dozen:3': 2,
    'col:1': 2, 'col:2': 2, 'col:3': 2
  };

  var LABELS = {
    'red': '红', 'black': '黑', 'odd': '奇', 'even': '偶', 'low': '1-18', 'high': '19-36',
    'dozen:1': '第1组 1-12', 'dozen:2': '第2组 13-24', 'dozen:3': '第3组 25-36',
    'col:1': '列1', 'col:2': '列2', 'col:3': '列3'
  };

  var COLOR_NAME = { green: '绿 0', red: '红', black: '黑' };

  function pocketColor(n) { return n === 0 ? 'green' : (RED.indexOf(n) >= 0 ? 'red' : 'black'); }
  DG.roulette.pocketColor = pocketColor;

  /* 旋转：rng 可注入（测试确定性）。返回 0-36。 */
  function spin(rng) { return Math.floor((rng || Math.random)() * 37); }
  DG.roulette.spin = spin;

  function betKind(id) { return id.split(':')[0]; }
  DG.roulette.betKind = betKind;

  function oddsOf(id) { return ODDS.hasOwnProperty(id) ? ODDS[id] : ODDS[betKind(id)]; }
  DG.roulette.oddsOf = oddsOf;

  /* 单注是否命中。0 落袋时只有直号 0 赢（外围全灭）。 */
  function betWins(bet, n) {
    var parts = bet.id.split(':'), kind = parts[0], arg = parts[1];
    if (n === 0) return kind === 'straight' && arg === '0';
    switch (kind) {
      case 'straight': return Number(arg) === n;
      case 'red': return RED.indexOf(n) >= 0;
      case 'black': return RED.indexOf(n) < 0;
      case 'odd': return n % 2 === 1;
      case 'even': return n % 2 === 0;
      case 'low': return n <= 18;
      case 'high': return n >= 19;
      case 'dozen': return Math.floor((n - 1) / 12) + 1 === Number(arg);
      case 'col': return (n - Number(arg)) % 3 === 0;
    }
    return false;
  }
  DG.roulette.betWins = betWins;

  function betLabel(bet) {
    var parts = String(bet.id).split(':');
    if (parts[0] === 'straight') return parts[1];
    return LABELS[bet.id] || bet.id;
  }
  DG.roulette.betLabel = betLabel;

  /* 结算一组投注：bets = [{id, stake}]（赌注已在旋转前扣除）。
   * 命中注收回 stake × (赔率 + 1)（含本金）；返回明细与净额 net = returned - staked。 */
  function settleBets(bets, n) {
    var staked = 0, returned = 0, items = [];
    for (var i = 0; i < bets.length; i++) {
      var b = bets[i];
      staked += b.stake;
      var win = betWins(b, n);
      var ret = win ? b.stake * (oddsOf(b.id) + 1) : 0;
      returned += ret;
      items.push({ id: b.id, label: betLabel(b), stake: b.stake, win: win, ret: ret });
    }
    return { pocket: n, color: pocketColor(n), colorName: COLOR_NAME[pocketColor(n)],
             staked: staked, returned: returned, net: returned - staked, items: items };
  }
  DG.roulette.settleBets = settleBets;

  /* 理论回报率：所有注同为 36/37（单零抽水） */
  DG.roulette.THEORETICAL_RTP = 36 / 37;
})(typeof window !== 'undefined' ? window : globalThis);
