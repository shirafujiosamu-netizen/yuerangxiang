/* 百家乐（Baccarat）：8 副靴，庄/闲/和三注（纯逻辑，无 DOM）
 * 规则：
 *   - A=1，2-9 面值，10/J/Q/K=0；手牌点数取个位数
 *   - 例牌（natural）：任一方 8 或 9 点立即开牌不再补
 *   - 闲家 0-5 补第三张，6-7 停；庄家按闲家第三张点数决定（标准补牌表）
 *   - 赔率：庄 1:1（赢抽 5% 佣）/ 闲 1:1 / 和 8:1（押庄闲和局退注）
 *   - 靴剩不足 6 副自动重洗（shufflePoint）
 * 蒙特卡洛验证：押庄庄家优势 ≈1.06%、押闲 ≈1.24%、押和 ≈14.36%。
 */
(function (root) {
  var DG = root.DG || (root.DG = {});

  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var SUITS = ['♠', '♥', '♦', '♣'];
  var DECKS = 8;
  var RESHUFFT_AT = 6 * 52;   /* 剩 6 副即重洗 */

  function cardValue(rank) {
    if (rank === 'A') return 1;
    if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 0;
    return +rank;
  }

  /* 8 副靴。rng 可注入（测试用）。 */
  function newShoe(rng) {
    rng = rng || Math.random;
    var shoe = [];
    for (var d = 0; d < DECKS; d++)
      for (var s = 0; s < 4; s++)
        for (var r = 0; r < 13; r++)
          shoe.push({ rank: RANKS[r], suit: SUITS[s], value: cardValue(RANKS[r]) });
    /* Fisher-Yates */
    for (var i = shoe.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = shoe[i]; shoe[i] = shoe[j]; shoe[j] = tmp;
    }
    return shoe;
  }

  function draw(shoe, rng) {
    if (shoe.length < RESHUFFT_AT && !shoe.fixed) {
      var fresh = newShoe(rng);
      shoe.length = 0;
      for (var i = 0; i < fresh.length; i++) shoe.push(fresh[i]);
    }
    return shoe.pop();
  }

  function total(cards) {
    var t = 0;
    for (var i = 0; i < cards.length; i++) t += cards[i].value;
    return t % 10;
  }

  function isNatural(t) { return t === 8 || t === 9; }

  /* 闲家是否补第三张（0-5 补） */
  function playerDraws(pt) { return pt <= 5; }

  /* 庄家是否补牌：pt=庄家两点，c=闲家第三张（未补传 null）。标准补牌表：
   * 0-2 恒补 / 3: 闲三≠8 补 / 4: 闲三∈{2..7} 补 / 5: 闲三∈{4..7} 补 / 6: 闲三∈{6,7} 补 / 7 恒停
   * （注意 5 是 4-7 补而非停，4 是 2-7 补——两行最易记反，曾致庄胜率 45.2% vs 标准 45.87%） */
  function bankerDraws(pt, c) {
    if (pt <= 2) return true;                    /* 0-2 恒补 */
    if (pt >= 7) return false;                   /* 7 恒停（6 在下方按闲三判断） */
    if (c == null) return pt <= 5;               /* 闲未补：3-5 补、6 停 */
    var cv = c.value;
    if (pt === 3) return cv !== 8;
    if (pt === 4) return !(cv === 0 || cv === 1 || cv === 8 || cv === 9);
    if (pt === 5) return cv >= 4 && cv <= 7;
    if (pt === 6) return cv === 6 || cv === 7;
    return false;
  }

  /* 发一局。返回完整牌路。 */
  function dealRound(shoe, rng) {
    rng = rng || Math.random;
    var player = [draw(shoe, rng), draw(shoe, rng)];
    var banker = [draw(shoe, rng), draw(shoe, rng)];
    var pt = total(player), bt = total(banker);
    var pThird = null, bThird = null, natural = isNatural(pt) || isNatural(bt);

    if (!natural) {
      if (playerDraws(pt)) {
        pThird = draw(shoe, rng);
        player.push(pThird);
        pt = total(player);
      }
      if (bankerDraws(bt, pThird)) {
        bThird = draw(shoe, rng);
        banker.push(bThird);
        bt = total(banker);
      }
    }
    var outcome = pt > bt ? 'player' : (bt > pt ? 'banker' : 'tie');
    return {
      player: player, banker: banker,
      pTotal: pt, bTotal: bt, outcome: outcome,
      natural: natural, pThird: pThird, bThird: bThird
    };
  }

  var PAYOUT = { player: 1, banker: 1, tie: 8 };   /* 净赔倍数 */
  var COMMISSION = 0.05;                            /* 庄赢抽佣 */

  /* 单注结算：bet ∈ {player, banker, tie}。返回 {win, net, commission}（net 已含佣）。 */
  function settleBet(bet, outcome, stake) {
    if (bet === outcome) {
      if (bet === 'banker') {
        var net = stake * PAYOUT.banker * (1 - COMMISSION);
        return { win: true, net: Math.round(net * 100) / 100, commission: stake * COMMISSION };
      }
      return { win: true, net: stake * PAYOUT[bet], commission: 0 };
    }
    if (outcome === 'tie') return { win: false, net: 0, commission: 0 };   /* 和局退庄闲注 */
    return { win: false, net: -stake, commission: 0 };
  }

  /* 多注结算（庄/闲/和可同押） */
  function settleBets(bets, outcome) {
    var staked = 0, returned = 0, details = [];
    for (var i = 0; i < bets.length; i++) {
      var b = bets[i], st = b.stake || 0;
      if (st <= 0) continue;
      var r = settleBet(b.bet, outcome, st);
      staked += st;
      returned += st + r.net;
      details.push({ bet: b.bet, stake: st, win: r.win, net: r.net, commission: r.commission });
    }
    return { staked: staked, returned: returned, net: returned - staked, details: details };
  }

  var BETS = [
    { id: 'player', label: '闲', note: '1:1' },
    { id: 'banker', label: '庄', note: '1:1 · 赢抽 5% 佣' },
    { id: 'tie',    label: '和', note: '8:1' }
  ];

  DG.baccarat = {
    RANKS: RANKS, SUITS: SUITS, DECKS: DECKS, PAYOUT: PAYOUT, COMMISSION: COMMISSION,
    BETS: BETS, cardValue: cardValue, newShoe: newShoe, draw: draw, total: total,
    isNatural: isNatural, playerDraws: playerDraws, bankerDraws: bankerDraws,
    dealRound: dealRound, settleBet: settleBet, settleBets: settleBets
  };
})(typeof window !== 'undefined' ? window : globalThis);
