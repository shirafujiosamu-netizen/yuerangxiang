/* 二十一点规则内核测试（node 直接跑）+ 蒙特卡洛庄家优势验证
 * 运行：node src/tests/run_blackjack_tests.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', 'js');
const LOGIC_FILES = ['data.js', 'core.js', 'state.js', 'pollution.js', 'skilltree.js', 'casino.js', 'archive.js', 'blackjack.js'];

const bundle = LOGIC_FILES.map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n;\n');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(bundle, sandbox, { filename: 'logic-bundle.js' });

var root = sandbox;
var DG = root.DG;
if (!DG) { console.error('FATAL: DG 命名空间未建立'); process.exit(1); }
var pass = 0, fail = 0, results = [];
function t(name, ok, extra) {
  if (ok) { pass++; results.push('PASS ' + name); }
  else { fail++; results.push('FAIL ' + name + (extra != null ? ' -> ' + extra : '')); }
}
function section(s) { results.push('', '== ' + s + ' =='); }

  var BJ = DG.blackjack;

  /* ---------- 1. 牌值与估值 ---------- */
  section('手牌估值');
  t('A+K = 21（blackjack 判定素材）', BJ.handValue([{ r: 'A', s: '♠', v: 11 }, { r: 'K', s: '♥', v: 10 }]).total === 21);
  t('A+A = 12 软牌', (function () { var h = BJ.handValue([{ r: 'A', v: 11 }, { r: 'A', v: 11 }]); return h.total === 12 && h.soft; })());
  t('A+A+9 = 21 软牌', (function () { var h = BJ.handValue([{ r: 'A', v: 11 }, { r: 'A', v: 11 }, { r: '9', v: 9 }]); return h.total === 21 && h.soft; })());
  t('A+6+K：A 降 1 → 17 硬牌', (function () { var h = BJ.handValue([{ r: 'A', v: 11 }, { r: '6', v: 6 }, { r: 'K', v: 10 }]); return h.total === 17 && !h.soft; })());
  t('K+Q+2 = 22 爆牌', BJ.handValue([{ r: 'K', v: 10 }, { r: 'Q', v: 10 }, { r: '2', v: 2 }]).total === 22);
  t('isBlackjack：两张 21 为真', BJ.isBlackjack([{ r: 'A', v: 11 }, { r: '10', v: 10 }]));
  t('isBlackjack：三张 21 为假', !BJ.isBlackjack([{ r: '7', v: 7 }, { r: '7', v: 7 }, { r: '7', v: 7 }]));

  /* ---------- 2. 牌靴 ---------- */
  section('牌靴');
  var shoe = BJ.shuffle(function () { return 0.5; });
  t('单副 52 张', shoe.length === 52);
  t('洗牌不丢牌（面值计数 4 张 A）', shoe.filter(function (c) { return c.r === 'A'; }).length === 4);
  t('四种花色齐全', new Set(shoe.map(function (c) { return c.s; })).size === 4);

  /* ---------- 3. 庄家规则（构造固定牌序） ---------- */
  section('庄家规则 S17');
  function riggedShoe(seq) { var i = 0; return function () { return seq[i++]; }; }
  /* 庄家 16 必须要牌：庄家 10+6 → 补 5 → 21 停（shoe 为数组，draw 从尾部取） */
  var st1 = { player: [], dealer: [], holeHidden: true, shoe: [] };
  st1.dealer = [{ r: '10', v: 10 }, { r: '6', v: 6 }];
  st1.shoe = [{ r: '5', v: 5 }];
  BJ.dealerPlay(st1);
  t('庄家 16 必须要牌', st1.dealer.length === 3 && BJ.handValue(st1.dealer).total === 21);
  /* 庄家软 17 停：A+6 → 停（S17） */
  var st2 = { player: [], dealer: [], shoe: [] };
  st2.dealer = [{ r: 'A', v: 11 }, { r: '6', v: 6 }];
  BJ.dealerPlay(st2);
  t('庄家软 17 停牌（S17）', st2.dealer.length === 2 && BJ.handValue(st2.dealer).total === 17);
  /* 庄家硬 17 停 */
  var st3 = { player: [], dealer: [], shoe: [] };
  st3.dealer = [{ r: '10', v: 10 }, { r: '7', v: 7 }];
  BJ.dealerPlay(st3);
  t('庄家硬 17 停牌', st3.dealer.length === 2);

  /* ---------- 4. 结算数学 ---------- */
  section('结算');
  function mkSt(player, dealer, bet) {
    return { player: player.map(function (c) { return { r: c[0], s: '♠', v: c[1] }; }),
             dealer: dealer.map(function (c) { return { r: c[0], s: '♥', v: c[1] }; }),
             bet: bet, doubled: false, demo: false, shoe: [] };
  }
  var s1 = mkSt([['A', 11], ['K', 10]], [['9', 9], ['7', 7]], 10);
  BJ.settle(s1);
  t('玩家 blackjack：3:2（净赚 15）', s1.outcome === 'blackjack' && s1.delta === 15, s1.outcome + '/' + s1.delta);
  var s2 = mkSt([['9', 9], ['8', 8]], [['10', 10], ['6', 6], ['6', 6]], 10);
  BJ.settle(s2);
  t('庄家爆牌：净赚 10', s2.outcome === 'win' && s2.delta === 10, s2.outcome + '/' + s2.delta);
  var s3 = mkSt([['10', 10], ['6', 6]], [['10', 10], ['6', 6]], 10);
  BJ.settle(s3);
  t('同点 push：退注 0', s3.outcome === 'push' && s3.delta === 0, s3.outcome + '/' + s3.delta);
  var s4 = mkSt([['10', 10], ['6', 6], ['9', 9]], [['10', 10], ['7', 7]], 10);
  BJ.settle(s4); /* 真爆牌（25）：结算由牌面判定，不再依赖 hit 里置的 outcome */
  t('玩家爆牌：付 10', s4.outcome === 'lose' && s4.delta === -10, s4.outcome + '/' + s4.delta);
  var s5 = mkSt([['K', 10], ['Q', 10]], [['A', 11], ['K', 10]], 10);
  BJ.settle(s5);
  t('庄家 blackjack 玩家普通 20：付 10', s5.outcome === 'lose' && s5.delta === -10, s5.outcome + '/' + s5.delta);
  var s6 = mkSt([['A', 11], ['K', 10]], [['A', 11], ['K', 10]], 10);
  BJ.settle(s6);
  t('双方 blackjack：push', s6.outcome === 'push' && s6.delta === 0, s6.outcome + '/' + s6.delta);
  var s7 = mkSt([['A', 11], ['K', 10]], [['9', 9], ['7', 7]], 10);
  s7.doubled = true; /* 加倍后不享 3:2 */
  BJ.settle(s7);
  t('加倍后的 21 只按 1:1（非 3:2）', s7.outcome === 'win' && s7.delta === 10, s7.outcome + '/' + s7.delta);

  /* ---------- 5. 加倍规则 ---------- */
  section('加倍');
  /* fixedShoe 直接注入牌堆（pop 顺序 = 数组倒序），免洗牌保证确定性 */
  function shoeOf(seq) { return seq.slice().reverse(); }
  var g = { desc: 100, mood: 10, stats: { wins: 0, lossStreak: 0 } };
  var r5 = BJ.newRound(g, 'desc', null, 1e12, shoeOf([
    { r: '5', v: 5 }, { r: '10', v: 10 }, { r: '6', v: 6 }, { r: 'K', v: 10 }, /* 玩家 5+6=11 庄家 10+K=20 */
    { r: 'A', v: 11 } /* 加倍补 A → 12，庄家 20 停 */
  ]));
  t('开局扣注 desc 100→90（newRound 内扣）', g.desc === 90, g.desc);
  var d5 = BJ.doubleDown(g, r5.state);
  t('加倍后再扣 10（bet 20）', g.desc === 80 && r5.state.bet === 20, g.desc + '/' + r5.state.bet);
  t('加倍后一张牌即结算（负 -20）', r5.state.done && r5.state.delta === -20, r5.state.delta);
  var g2 = { desc: 100, stats: { wins: 0, lossStreak: 0 } };
  var r6 = BJ.newRound(g2, 'desc', null, 1e12, shoeOf([
    { r: '9', v: 9 }, { r: '5', v: 5 }, { r: '7', v: 7 }, { r: '3', v: 3 }, { r: '4', v: 4 },
    { r: '10', v: 10 } /* 备用：庄家补牌 */
  ]));
  var d6 = BJ.hit(r6.state);
  t('要牌后不能加倍（限首两张）', !BJ.doubleDown(g2, r6.state).ok);
  t('要牌计入手牌', r6.state.player.length === 3);

  /* ---------- 5.5 分牌 ---------- */
  section('分牌');
  /* 发牌顺序：玩家 A♠、庄家 9♥、玩家 A♦、庄家 7♥；分牌各补 5♦ / 6♣；庄家 16 补 10 爆 */
  var g7 = { desc: 100, stats: { wins: 0, lossStreak: 0 } };
  var r7 = BJ.newRound(g7, 'desc', null, 1e12, shoeOf([
    { r: 'A', s: '♠', v: 11 }, { r: '9', s: '♥', v: 9 },
    { r: 'A', s: '♦', v: 11 }, { r: '7', s: '♥', v: 7 },
    { r: '5', s: '♦', v: 5 }, { r: '6', s: '♣', v: 6 },
    { r: '10', s: '♠', v: 10 }
  ]));
  var st7 = r7.state;
  t('两张同点可分牌', BJ.canSplit(g7, st7));
  t('不同点不可分牌', !BJ.canSplit(g7, mkSt([['K', 10], ['Q', 10]], [['9', 9]], 10)));
  t('存在档（demo）不可分牌', !BJ.canSplit({ desc: 100 }, { tier: { res: 'desc' }, demo: true, player: [{ r: 'A', v: 11 }, { r: 'A', v: 11 }], bet: 10, done: false }));
  t('资源不足不可分牌', !BJ.canSplit({ desc: 5 }, { tier: { res: 'desc' }, demo: false, player: [{ r: 'A', v: 11 }, { r: 'A', v: 11 }], bet: 10, done: false }));

  var sp = BJ.split(g7, st7);
  t('分牌成功并再扣一份底注', sp.ok && g7.desc === 80, g7.desc + '/' + sp.ok);
  t('两手各两张牌', st7.player.length === 2 && st7.pending.length === 1 && st7.pending[0].cards.length === 2);
  t('分牌后第一手 = A+5 = 16', BJ.handValue(st7.player).total === 16, BJ.handValue(st7.player).total);

  BJ.stand(st7); /* 第一手停：切到第二手，不结算 */
  t('第一手停后切到第二手（未结算）', !st7.done && st7.handNo === 2 && BJ.handValue(st7.player).total === 17);

  BJ.stand(st7); /* 第二手停：庄家补 10 爆，两手都赢 */
  t('两手合计结算：+20', st7.delta === 20 && st7.outcome === 'win', st7.delta + '/' + st7.outcome);
  t('结算文案分注到手', /第 1 手/.test(st7.payoutDesc) && /第 2 手/.test(st7.payoutDesc));

  /* 分牌后的 21 只按 1:1（不是 3:2） */
  var g8 = { desc: 100, stats: { wins: 0, lossStreak: 0 } };
  var r8 = BJ.newRound(g8, 'desc', null, 1e12, shoeOf([
    { r: 'A', s: '♠', v: 11 }, { r: '9', s: '♥', v: 9 },
    { r: 'A', s: '♦', v: 11 }, { r: '7', s: '♥', v: 7 },
    { r: 'K', s: '♦', v: 10 }, { r: 'Q', s: '♣', v: 10 },
    { r: '10', s: '♠', v: 10 }
  ]));
  BJ.split(g8, r8.state);
  BJ.stand(r8.state);
  BJ.stand(r8.state);
  t('分牌后的 21 按 1:1（+20 而非 +30）', r8.state.delta === 20, r8.state.delta);

  /* ---------- 6. 蒙特卡洛：庄家优势 ---------- */
  section('蒙特卡洛（基本策略）');
  var rounds = 200000, staked = 0, net = 0, rng = (function () { var s = 12345; return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; })();
  for (var i = 0; i < rounds; i++) {
    var gs = { desc: 1e9, stats: { wins: 0, lossStreak: 0 } };
    var rr = BJ.newRound(gs, 'desc', rng, 1e12);
    if (!rr.ok) continue;
    var st = rr.state;
    staked += st.bet;
    if (BJ.isBlackjack(st.player)) { BJ.settle(st); net += st.delta; continue; }
    /* 基本策略（简化）：12 以下要、17 以上停；加倍简化为不要 */
    var guard = 0;
    while (!st.done && guard++ < 12) {
      var act = BJ.basicStrategyAction(st.player);
      if (act === 'hit') BJ.hit(st);
      else BJ.stand(st);
    }
    /* 爆牌局 hit 内已自动 settle；其余 stand 内结算。此处双保险 */
    if (st.outcome && st.delta !== 0 || st.done) { net += st.delta; }
  }
  var edge = -net / staked * 100;
  t('庄家优势在 0~12% 区间（简化基本策略）', edge >= 0 && edge < 12, edge.toFixed(2) + '%');
  t('不过分抽水（<12%，完整基本策略+看庄家明牌应 <1%）', edge < 12, edge.toFixed(2) + '%');

  console.log(results.join('\n'));
  console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  console.log('庄家优势（基本策略蒙特卡洛）: ' + edge.toFixed(2) + '%');

