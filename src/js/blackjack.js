/* 二十一点（Blackjack）规则内核——Eidos 赌场（纯逻辑，无 DOM，可 node 测试）
 * 规则基线：单副牌靴；庄家软 17 停（S17）；blackjack 3:2；push 退注；
 * 加倍限首两张、加倍后一张牌停牌；分牌支持一次（同点分两手，第二手打完再回第一手）。
 * Eidos 化：blackjack=「极点」=完美手牌，触发庄家特别台词（UI 层接 completionLine）；
 * 连输极点 debuff 由 casino.js 既有机制承担，本模块只管牌局与赔付数学。
 */
(function (root) {
  var DG = root.DG || (root.DG = {});
  if (!DG.blackjack) DG.blackjack = {};

  var SUITS = ['♠', '♥', '♦', '♣'];
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  function rankValue(r) { return (r === 'A') ? 11 : ((r === 'J' || r === 'Q' || r === 'K') ? 10 : parseInt(r, 10)); }

  /* 牌：{r, s, v}，v 为该张面值（A=11，软牌结算时降级） */
  function makeCard(r, s) { return { r: r, s: s, v: rankValue(r) }; }

  function shuffle(rng) {
    var shoe = [];
    for (var i = 0; i < RANKS.length; i++)
      for (var j = 0; j < SUITS.length; j++) shoe.push(makeCard(RANKS[i], SUITS[j]));
    for (var k = shoe.length - 1; k > 0; k--) {
      var m = Math.floor(rng() * (k + 1));
      var tmp = shoe[k]; shoe[k] = shoe[m]; shoe[m] = tmp;
    }
    return shoe;
  }
  DG.blackjack.shuffle = shuffle;

  /* 手牌估值：返回 {total, soft}。soft=true 表示含按 11 计的 A 且未爆 */
  function handValue(cards) {
    var total = 0, aces = 0;
    for (var i = 0; i < cards.length; i++) {
      total += cards[i].v;
      if (cards[i].r === 'A') aces++;
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total: total, soft: aces > 0 };
  }
  DG.blackjack.handValue = handValue;

  function isBlackjack(cards) { return cards.length === 2 && handValue(cards).total === 21; }
  DG.blackjack.isBlackjack = isBlackjack;

  function isBust(cards) { return handValue(cards).total > 21; }
  DG.blackjack.isBust = isBust;

  /* 开局新牌局：扣注由 casino.start 负责，本函数只建牌局状态并发前四张。
   * fixedShoe：测试注入用（直接作为牌堆，免洗牌）；生产不传，走 shuffle(rng)。 */
  function newRound(s, tierId, rng, now, fixedShoe) {
    rng = rng || Math.random;
    now = now || Date.now();
    var t = DG.casino.get(tierId);
    if (!t) return { ok: false, err: '赌注等级不存在' };
    if (!t.demo && s[t.res] < t.stake) return { ok: false, err: (t.res === 'desc' ? '描述' : '情绪') + '不足（需要 ' + t.stake + '）' };
    var st = {
      tierId: tierId, tier: t, demo: !!t.demo,
      shoe: fixedShoe ? fixedShoe.slice() : shuffle(rng),
      player: [], dealer: [], holeHidden: true,
      bet: t.stake, doubled: false, stood: false, done: false,
      pending: [], finished: [], fromSplit: false, handNo: 1,
      outcome: null, delta: 0, payoutDesc: '', startedAt: now
    };
    /* 标准发牌顺序：玩家、庄家、玩家、庄家（庄家第二张暗牌） */
    st.player.push(draw(st));
    st.dealer.push(draw(st));
    st.player.push(draw(st));
    st.dealer.push(draw(st));
    /* 开局扣注（demo 档不扣）。加倍注在 doubleDown 里扣。 */
    if (!st.demo) s[t.res] -= st.bet;
    if (s.stats) s.stats.rounds = (s.stats.rounds || 0) + 1; /* 局数计数（与 casino.start 同口径） */
    st.openingBlackjack = isBlackjack(st.player);
    return { ok: true, state: st };
  }
  DG.blackjack.newRound = newRound;

  function draw(st) { return st.shoe.pop(); }

  /* 玩家要牌：爆牌自动结算（调用方不会漏赔）。分牌后爆牌只切下一手。返回 {bust, advanced} */
  function hit(st) {
    if (st.done) return { ok: false, err: '本局已结束' };
    st.player.push(draw(st));
    if (isBust(st.player)) {
      if (st.pending.length) {
        nextHand(st);
        return { ok: true, bust: true, advanced: true, total: handValue(st.player).total };
      }
      st.done = true;
      settle(st); /* 爆牌即负，立即结算，delta 写入 */
    }
    return { ok: true, bust: isBust(st.player), total: handValue(st.player).total };
  }
  DG.blackjack.hit = hit;

  /* 停牌：还有下一手就切过去，否则庄家回合 */
  function stand(st) {
    if (st.done) return { ok: false, err: '本局已结束' };
    st.stood = true;
    if (st.pending.length) { nextHand(st); return { ok: true, advanced: true }; }
    st.done = true;
    dealerPlay(st);
    settle(st);
    return { ok: true };
  }
  DG.blackjack.stand = stand;

  /* 分牌：首两张同点可分成两手，各补一张；两手各按一份底注结算 */
  function canSplit(s, st) {
    if (!st || !st.tier || st.done) return false;
    if (st.fromSplit) return false;
    if (st.player.length !== 2) return false;
    var a = st.player[0], b = st.player[1];
    if (rankValue(a.r) !== rankValue(b.r)) return false;
    if (st.demo) return false;
    return s[st.tier.res] >= st.bet;
  }
  DG.blackjack.canSplit = canSplit;

  function split(s, st) {
    if (!canSplit(s, st)) {
      if (!st || st.done) return { ok: false, err: '本局已结束' };
      if (st.fromSplit) return { ok: false, err: '分牌只可一次' };
      if (st.player.length !== 2) return { ok: false, err: '分牌限首两张' };
      if (st.demo) return { ok: false, err: '存在档（demo）不可分牌' };
      if (rankValue(st.player[0].r) !== rankValue(st.player[1].r)) return { ok: false, err: '两张点数不同，不能分牌' };
      return { ok: false, err: '资源不足（分牌需再押 ' + st.bet + '）' };
    }
    s[st.tier.res] -= st.bet;
    var moved = st.player.pop();
    st.player.push(draw(st));            /* 第一手补一张 */
    st.pending.push({ cards: [moved, draw(st)], bet: st.bet, doubled: false });
    st.fromSplit = true;
    st.handNo = 1;
    /* 分牌后第一手若已是 21，不必强制停，交给玩家；爆牌则切手 */
    if (isBust(st.player)) {
      if (st.pending.length) nextHand(st);
      else { st.done = true; settle(st); }
    }
    return { ok: true, total: handValue(st.player).total };
  }
  DG.blackjack.split = split;

  /* 切到下一手：先把已打完的这一手记进 finished，再让待打的手接管 player / bet */
  function nextHand(st) {
    st.finished = st.finished || [];
    st.finished.push({ cards: st.player, bet: st.bet, doubled: !!st.doubled });
    var nx = st.pending.shift();
    st.player = nx.cards;
    st.bet = nx.bet;
    st.doubled = false;
    st.stood = false;
    st.handNo = (st.handNo || 1) + 1;
  }
  DG.blackjack.nextHand = nextHand;

  /* 加倍：限首两张、未要牌前；扣一倍注、发一张、庄家回合、结算 */
  function doubleDown(s, st) {
    if (st.done) return { ok: false, err: '本局已结束' };
    if (st.doubled) return { ok: false, err: '已加倍' };
    if (st.player.length !== 2) return { ok: false, err: '加倍限首两张' };
    if (st.demo) return { ok: false, err: '存在档（demo）不可加倍' };
    if (s[st.tier.res] < st.bet) return { ok: false, err: (st.tier.res === 'desc' ? '描述' : '情绪') + '不足（加倍需再押 ' + st.bet + '）' };
    s[st.tier.res] -= st.bet;
    st.bet *= 2;
    st.doubled = true;
    st.player.push(draw(st));
    var bust = isBust(st.player);
    if (!bust && st.pending.length) { nextHand(st); return { ok: true, advanced: true, total: handValue(st.player).total }; }
    st.done = true;
    if (!bust) dealerPlay(st);
    settle(st);
    return { ok: true, bust: bust, total: handValue(st.player).total };
  }
  DG.blackjack.doubleDown = doubleDown;

  /* 庄家规则：<17 必须要牌；软 17 停（S17） */
  function dealerPlay(st) {
    st.holeHidden = false;
    while (handValue(st.dealer).total < 17) st.dealer.push(draw(st));
  }
  DG.blackjack.dealerPlay = dealerPlay;

  /* 单结算一手：爆牌即负；两极点为 3:2（分牌或加倍后的 21 按普通胜 1:1）；
   * 其余比点数。fromSplit / doubled 都不再享受自然极点赔付。 */
  function settleHand(cards, bet, dealerCards, fromSplit, doubled) {
    var p = handValue(cards), d = handValue(dealerCards);
    var pb = isBlackjack(cards), db = isBlackjack(dealerCards);
    if (p.total > 21) return { outcome: 'lose', delta: -bet, desc: '爆牌。付掉 ' + bet + '。' };
    if (pb && db) return { outcome: 'push', delta: 0, desc: '双方二十一点。和局，退注。' };
    if (pb) {
      if (!fromSplit && !doubled) return {
        outcome: 'blackjack', delta: bet * 1.5,
        desc: '二十一点。极点。退注，另赔 ' + (bet * 1.5) + '。',
        line: '二十一点。你恰好停在极点——这让我有点意外。'
      };
      return { outcome: 'win', delta: bet, desc: '二十一点。按普通胜计，退注，净赚 ' + bet + '。' };
    }
    if (db) return { outcome: 'lose', delta: -bet, desc: '庄家二十一点。付掉 ' + bet + '。' };
    if (d.total > 21) return { outcome: 'win', delta: bet, desc: '庄家爆牌。退注，净赚 ' + bet + '。' };
    if (p.total > d.total) return { outcome: 'win', delta: bet, desc: '大过庄家。退注，净赚 ' + bet + '。' };
    if (p.total < d.total) return { outcome: 'lose', delta: -bet, desc: '小过庄家。付掉 ' + bet + '。' };
    return { outcome: 'push', delta: 0, desc: '同点。和局，退注。' };
  }
  DG.blackjack.settleHand = settleHand;

  /* 结算：逐手结算后汇总写回 st.outcome / st.delta / st.payoutDesc / st.eidosLine */
  function settle(st) {
    var hands = [];
    for (var f = 0; f < (st.finished || []).length; f++) hands.push(st.finished[f]);
    hands.push({ cards: st.player, bet: st.bet, doubled: !!st.doubled });
    for (var i = 0; i < (st.pending || []).length; i++) {
      hands.push({ cards: st.pending[i].cards, bet: st.pending[i].bet, doubled: !!st.pending[i].doubled });
    }
    var multi = hands.length > 1 || !!st.fromSplit;
    var total = 0, parts = [], outs = [], line = null;
    for (var k = 0; k < hands.length; k++) {
      var r = settleHand(hands[k].cards, hands[k].bet, st.dealer, multi, hands[k].doubled);
      total += r.delta;
      parts.push(multi ? ('第 ' + (k + 1) + ' 手：' + r.desc) : r.desc);
      outs.push(r.outcome);
      if (r.line) line = r.line;
    }
    st.handResults = outs;
    st.delta = total;
    st.payoutDesc = parts.join(' ');
    st.eidosLine = line;
    st.outcome = hands.length === 1 ? outs[0]
      : (total > 0 ? 'win' : (total < 0 ? 'lose' : 'push'));
    if (st.demo) st.delta = 0;
    return st;
  }
  DG.blackjack.settle = settle;

  /* 把牌局结果并回玩家资源与统计（s 为游戏状态）。
   * 连输达 COMPLETE_STREAK 触发「完成」debuff（与 casino.js 旧骰子局同一机制）。 */
  function applyToState(s, st, now) {
    now = now || Date.now();
    var completed = false, completionText = null;
    if (st.demo) return { delta: 0, outcome: st.outcome, completed: false };
    s[st.tier.res] += st.delta;
    if (st.delta > 0) { s.stats.wins++; s.stats.lossStreak = 0; }
    else if (st.delta < 0) {
      s.stats.lossStreak++;
      if (s.stats.lossStreak >= DG.casino.COMPLETE_STREAK) {
        completed = true;
        s.completedUntil = now + DG.casino.COMPLETE_MS;
        s.stats.lossStreak = 0;
        completionText = '连败至此，你已被「完成」——完美，且不再说话。备注：产出减半，持续 '
          + (DG.casino.COMPLETE_MS / 1000) + ' 秒。';
      }
    }
    return { delta: st.delta, outcome: st.outcome, completed: completed, completionText: completionText };
  }
  DG.blackjack.applyToState = applyToState;

  /* 牌面显示 */
  function cardText(c) { return c.r + c.s; }
  DG.blackjack.cardText = cardText;

  /* 简单基本策略（供测试与「最优策略期望值」验证用，非 UI 承诺）：
   * 硬 12 以下要、17 以上停；软牌总 17 以下要、18 以上停；11 必加倍（简化：要）。 */
  function basicStrategyAction(cards) {
    var hv = handValue(cards);
    if (hv.total >= 17) return 'stand';
    if (hv.soft && hv.total >= 18) return 'stand';
    if (hv.total <= 11) return 'hit';
    return 'hit'; /* 12-16 简化为要牌（真实策略看庄家明牌） */
  }
  DG.blackjack.basicStrategyAction = basicStrategyAction;
})(typeof window !== 'undefined' ? window : globalThis);
