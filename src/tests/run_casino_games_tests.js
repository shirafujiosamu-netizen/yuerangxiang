/* 轮盘 + 老虎机规则内核测试（node 直接跑）+ 蒙特卡洛回报率验证
 * 运行：node src/tests/run_casino_games_tests.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', 'js');
const LOGIC_FILES = ['data.js', 'core.js', 'state.js', 'pollution.js', 'skilltree.js', 'casino.js', 'archive.js', 'roulette.js', 'slots.js'];

const bundle = LOGIC_FILES.map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n;\n');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(bundle, sandbox, { filename: 'casino-games-bundle.js' });

var root = sandbox;
var DG = root.DG;
if (!DG) { console.error('FATAL: DG 命名空间未建立'); process.exit(1); }
var pass = 0, fail = 0, results = [];
function t(name, ok, extra) {
  if (ok) { pass++; results.push('PASS ' + name); }
  else { fail++; results.push('FAIL ' + name + (extra != null ? ' -> ' + extra : '')); }
}
function section(s) { results.push('', '== ' + s + ' =='); }
/* 确定性 PRNG：mulberry32（Math.imul 32 位运算，无 2^53 精度丢失）。
 * 注意：不要用 seed*1103515245 式 LCG——乘积超 2^53 会被浮点舍入，随机数有偏。 */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function done() {
  console.log(results.join('\n'));
  console.log('\n轮盘+老虎机内核：' + pass + '/' + (pass + fail) + ' 通过' + (fail ? '，' + fail + ' 失败' : ''));
  process.exit(fail ? 1 : 0);
}

/* ================= 轮盘 ================= */
var RL = DG.roulette;
section('轮盘：颜色与旋转');
t('0 为绿', RL.pocketColor(0) === 'green');
t('1 为红', RL.pocketColor(1) === 'red');
t('2 为黑', RL.pocketColor(2) === 'black');
t('36 为红', RL.pocketColor(36) === 'red');
t('35 为黑', RL.pocketColor(35) === 'black');
t('红黑各 18', (function () {
  var r = 0, b = 0;
  for (var n = 1; n <= 36; n++) { RL.pocketColor(n) === 'red' ? r++ : b++; }
  return r === 18 && b === 18;
})());
t('spin(rng=0) → 0', RL.spin(function () { return 0; }) === 0);
t('spin 映射正确（17/37 → 17）', RL.spin(function () { return 17 / 37; }) === 17);
t('spin 边界（0.999 → 36）', RL.spin(function () { return 0.999; }) === 36);
t('spin 始终在 0-36', (function () {
  for (var i = 0; i < 5000; i++) { var n = RL.spin(Math.random); if (n < 0 || n > 36 || n !== Math.floor(n)) return false; }
  return true;
})());

section('轮盘：投注判定');
function bet(id) { return { id: id, stake: 10 }; }
t('直号 17 中 17', RL.betWins(bet('straight:17'), 17));
t('直号 17 不中 18', !RL.betWins(bet('straight:17'), 18));
t('红中 1', RL.betWins(bet('red'), 1));
t('红不中 2', !RL.betWins(bet('red'), 2));
t('黑中 2', RL.betWins(bet('black'), 2));
t('奇中 17', RL.betWins(bet('odd'), 17));
t('偶中 2', RL.betWins(bet('even'), 2));
t('1-18 中 18', RL.betWins(bet('low'), 18));
t('1-18 不中 19', !RL.betWins(bet('low'), 19));
t('19-36 中 19', RL.betWins(bet('high'), 19));
t('第1组含 12', RL.betWins(bet('dozen:1'), 12));
t('第1组不含 13', !RL.betWins(bet('dozen:1'), 13));
t('第2组含 13-24', RL.betWins(bet('dozen:2'), 13) && RL.betWins(bet('dozen:2'), 24));
t('第3组含 25-36', RL.betWins(bet('dozen:3'), 25) && RL.betWins(bet('dozen:3'), 36));
t('列1 = 1,4,7…34', RL.betWins(bet('col:1'), 1) && RL.betWins(bet('col:1'), 34) && !RL.betWins(bet('col:1'), 2));
t('列2 = 2,5…35', RL.betWins(bet('col:2'), 35) && !RL.betWins(bet('col:2'), 36));
t('列3 = 3,6…36', RL.betWins(bet('col:3'), 36) && !RL.betWins(bet('col:3'), 35));
t('0 落袋：外围全灭', !RL.betWins(bet('red'), 0) && !RL.betWins(bet('odd'), 0) && !RL.betWins(bet('low'), 0) && !RL.betWins(bet('dozen:1'), 0) && !RL.betWins(bet('col:1'), 0));
t('0 落袋：直号 0 通吃', RL.betWins(bet('straight:0'), 0));
t('0 落袋：直号 17 死', !RL.betWins(bet('straight:17'), 0));

section('轮盘：结算数学');
/* 19 = 红·奇·19-36·第2组·列2（欧洲轮盘红色号码） */
var r1 = RL.settleBets([bet('straight:19'), bet('red')], 19);
t('19 红双中：押 20 收回 380，净 +360', r1.staked === 20 && r1.returned === 380 && r1.net === 360, JSON.stringify(r1));
t('结算带落袋颜色', r1.color === 'red' && r1.colorName === '红');
var r2 = RL.settleBets([bet('straight:17'), bet('red')], 2);
t('2 黑全灭：净 -20', r2.returned === 0 && r2.net === -20, JSON.stringify(r2));
var r3 = RL.settleBets([bet('straight:17'), bet('red')], 1);
t('1 红：外围中直号死，收回 20，净 0', r3.returned === 20 && r3.net === 0, JSON.stringify(r3));
var r3b = RL.settleBets([bet('straight:17'), bet('black')], 17);
t('17（黑）中直号+黑：收回 380，净 +360', r3b.returned === 380 && r3b.net === 360, JSON.stringify(r3b));
var r4 = RL.settleBets([bet('dozen:2')], 18);
t('打数中：10 押收回 30，净 +20', r4.returned === 30 && r4.net === 20, JSON.stringify(r4));
t('betLabel：straight:17 → 17', RL.betLabel(bet('straight:17')) === '17');
t('betLabel：dozen:2 → 第2组 13-24', RL.betLabel(bet('dozen:2')) === '第2组 13-24');
t('betLabel：red → 红', RL.betLabel(bet('red')) === '红');
t('赔率表：直号 35 / 外围 1 / 打数列 2', RL.oddsOf('straight:5') === 35 && RL.oddsOf('red') === 1 && RL.oddsOf('dozen:2') === 2 && RL.oddsOf('col:3') === 2);
t('理论 RTP = 36/37', Math.abs(RL.THEORETICAL_RTP - 36 / 37) < 1e-12);

section('轮盘：蒙特卡洛（20 万局押红）');
(function () {
  var N = 200000, betAmt = 10, wagered = 0, returned = 0;
  var rng = mulberry32(20261023);
  for (var i = 0; i < N; i++) {
    var n = RL.spin(rng);
    var r = RL.settleBets([bet('red')], n);
    wagered += betAmt; returned += r.returned;
  }
  var rtp = returned / wagered;
  t('押红 RTP ≈ 36/37（±0.005）', Math.abs(rtp - 36 / 37) < 0.005, rtp.toFixed(5));
  t('庄家优势 ≈ 2.70%', Math.abs((1 - rtp) - 1 / 37) < 0.005, (1 - rtp).toFixed(5));
  t('0 号频率 ≈ 1/37', (function () {
    var zeros = 0;
    for (var j = 0; j < 37000; j++) if (RL.spin(rng) === 0) zeros++;
    return Math.abs(zeros / 37000 - 1 / 37) < 0.004;
  })(), 'zeros ok');
})();

/* ================= 老虎机 ================= */
var SL = DG.slots;
section('老虎机：符号与抽取');
t('符号表 6 个，权重和 100', SL.SYMBOLS.length === 6 && SL.TOTAL_W === 100);
t('drawOne(0) → 樱桃', SL.drawOne(function () { return 0; }).id === 'cherry');
t('drawOne(0.5) → 柠檬', SL.drawOne(function () { return 0.5; }).id === 'lemon');
t('drawOne(0.6) → 铃铛', SL.drawOne(function () { return 0.6; }).id === 'bell');
t('drawOne(0.9) → 星星', SL.drawOne(function () { return 0.9; }).id === 'star');
t('drawOne(0.95) → 幸运七', SL.drawOne(function () { return 0.95; }).id === 'seven');
t('drawOne 边界(0.27) → 樱桃 / (0.29) → 柠檬', SL.drawOne(function () { return 0.27; }).id === 'cherry' && SL.drawOne(function () { return 0.29; }).id === 'lemon');
t('drawOne 频率≈权重', (function () {
  var c = { cherry: 0, lemon: 0, bell: 0, gem: 0, star: 0, seven: 0 }, N = 60000;
  var rng = mulberry32(777);
  for (var i = 0; i < N; i++) c[SL.drawOne(rng).id]++;
  return Math.abs(c.cherry / N - 0.28) < 0.004 && Math.abs(c.seven / N - 0.06) < 0.003;
})());

section('老虎机：旋转判定');
t('三连樱桃：mult 4', (function () { var r = SL.spin(function () { return 0.1; }); return r.kind === 'three' && r.mult === 4 && r.symbol.id === 'cherry'; })());
t('三连七：mult 400（极点）', (function () { var r = SL.spin(function () { return 0.95; }); return r.kind === 'three' && r.mult === 400; })());
t('散对星星（星-樱-星）：mult 5', (function () {
  var seq = [0.9, 0.0, 0.9], i = 0;
  var r = SL.spin(function () { return seq[i++]; });
  return r.kind === 'pair' && r.mult === 5 && r.symbol.id === 'star';
})());
t('相邻对幸运七：mult 14', (function () {
  var seq = [0.95, 0.95, 0.1], i = 0;
  var r = SL.spin(function () { return seq[i++]; });
  return r.kind === 'pair' && r.mult === 14;
})());
t('低符号两连不赔', (function () {
  var seq = [0.1, 0.1, 0.29], i = 0;   /* 樱桃·樱桃·柠檬 */
  var r = SL.spin(function () { return seq[i++]; });
  return r.kind === 'none' && r.mult === 0;
})());
t('三连优先于散对', (function () {
  var r = SL.spin(function () { return 0.9; });
  return r.kind === 'three' && r.mult === 120;
})());
t('未中奖：mult 0', (function () {
  var seq = [0.1, 0.5, 0.9], i = 0;
  var r = SL.spin(function () { return seq[i++]; });
  return r.kind === 'none' && r.mult === 0;
})());

section('老虎机：RTP');
t('理论 RTP ≈ 0.9643（含本金返还）', Math.abs(SL.theoreticalRTP() - 0.9643) < 0.001, SL.theoreticalRTP().toFixed(5));
t('理论 RTP 在 92%-97% 合理区间', SL.theoreticalRTP() > 0.92 && SL.theoreticalRTP() < 0.97, SL.theoreticalRTP().toFixed(5));
/* 公式自检：216 种卷轴组合精确枚举（与 closed-form 互相验证） */
(function () {
  var S = SL.SYMBOLS, W = SL.TOTAL_W, exact = 0;
  for (var i = 0; i < S.length; i++) for (var j = 0; j < S.length; j++) for (var k = 0; k < S.length; k++) {
    var p = (S[i].weight / W) * (S[j].weight / W) * (S[k].weight / W);
    var mult = 0;
    if (i === j && j === k) mult = S[i].pay3;
    else {
      var c = {}; c[S[i].id] = 1; c[S[j].id] = (c[S[j].id] || 0) + 1; c[S[k].id] = (c[S[k].id] || 0) + 1;
      for (var id in c) if (c[id] === 2 && SL.byId(id).pay2 > 0) mult = SL.byId(id).pay2;
    }
    exact += p * (mult > 0 ? 1 + mult : 0);
  }
  t('theoreticalRTP 与 216 组合精确枚举一致', Math.abs(SL.theoreticalRTP() - exact) < 1e-12, exact.toFixed(6));
})();
(function () {
  /* 100 万局。400× 大奖使方差大（σ≈0.0076@1M），容差 ±0.02 ≈ 2.6σ；
   * 曾经的 104% 公式 bug 偏差 +0.077 ≈ 10σ，仍能被稳定抓住。 */
  var N = 1000000, betAmt = 10, wagered = 0, returned = 0;
  var rng = mulberry32(424242);
  for (var i = 0; i < N; i++) {
    var r = SL.spin(rng);
    wagered += betAmt;
    returned += r.mult > 0 ? betAmt + betAmt * r.mult : 0;
  }
  var rtp = returned / wagered;
  t('蒙特卡洛 RTP ≈ 理论值（100 万局，±0.02）', Math.abs(rtp - SL.theoreticalRTP()) < 0.02, rtp.toFixed(5) + ' vs ' + SL.theoreticalRTP().toFixed(5));
})();

/* ================= applyOutcome 通用入账 ================= */
section('applyOutcome：资源/统计/debuff');
function mkState() {
  return { desc: 100, mood: 50, stats: { rounds: 0, wins: 0, lossStreak: 0 }, completedUntil: 0 };
}
var sa = mkState();
var oa = DG.casino.applyOutcome(sa, DG.casino.get('desc'), 30, 1000);
t('胜局：+30 描述，wins 1，连败清零', sa.desc === 130 && sa.stats.wins === 1 && sa.stats.lossStreak === 0);
t('返回 delta 与 win', oa.delta === 30 && oa.win === true);
var sb = mkState();
DG.casino.applyOutcome(sb, DG.casino.get('desc'), -10, 1000);
t('负局：-10 描述，连败 1', sb.desc === 90 && sb.stats.lossStreak === 1);
var sc = mkState();
for (var k = 0; k < 5; k++) DG.casino.applyOutcome(sc, DG.casino.get('mood'), -10, 1000 + k);
t('连输 5 局触发「完成」debuff', sc.completedUntil === 1000 + 4 + 60000, 'until=' + sc.completedUntil);
t('debuff 期间 isCompleted 为真', DG.casino.isCompleted(sc, 1000 + 4 + 30000));
t('debuff 过期后 isCompleted 为假', !DG.casino.isCompleted(sc, 1000 + 4 + 60001));
t('触发后连败清零重计', sc.stats.lossStreak === 0);
var sd = mkState();
var od = DG.casino.applyOutcome(sd, DG.casino.get('being'), 999, 1000);
t('demo 档：资源不动、delta 0', sd.desc === 100 && od.delta === 0 && od.win === true);
var se = mkState();
DG.casino.applyOutcome(se, DG.casino.get('desc'), 0, 1000);
t('和局（net 0）：不计胜负', se.stats.wins === 0 && se.stats.lossStreak === 0 && se.desc === 100);

done();
