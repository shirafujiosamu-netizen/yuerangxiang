/* 骰宝 + 百家乐内核测试（纯逻辑，node 运行）
 * 覆盖：规则断言 + 补牌表逐格 + 蒙特卡洛庄家优势验证
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const JS_DIR = path.join(__dirname, '..', 'js');
const bundle = ['core.js', 'sicbo.js', 'baccarat.js']
  .map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n;\n');
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(bundle, sandbox, { filename: 'bundle.js' });
const SB = sandbox.DG.sicbo, BC = sandbox.DG.baccarat;

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + detail : '')); }
}
function section(s) { console.log('\n== ' + s + ' =='); }

/* 确定性 PRNG：mulberry32（Math.imul 32 位安全，勿用 seed*大常数 LCG） */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let q = Math.imul(a ^ (a >>> 15), 1 | a);
    q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
}
/* 固定牌堆（跳过洗牌，.fixed 标记禁自动重洗） */
function fixedShoe(ranks) {
  const suit = '♠';
  const shoe = ranks.map(r => ({ rank: r, suit, value: BC.cardValue(r) }));
  shoe.fixed = true;
  return shoe;
}
function rollOf(a, b, c) { return SB.rollDice(function () { return 0; }); }

/* ================= 骰宝 ================= */
section('骰宝：掷骰与点数');
{
  const rng = mulberry32(1);
  let ok = true;
  for (let i = 0; i < 10000; i++) {
    const r = SB.rollDice(rng);
    if (r.d.length !== 3 || r.d.some(d => d < 1 || d > 6 || !Number.isInteger(d))) { ok = false; break; }
    if (r.total !== r.d[0] + r.d[1] + r.d[2]) { ok = false; break; }
    if (r.total < 3 || r.total > 18) { ok = false; break; }
  }
  t('rollDice：三粒 1-6 整数、总和一致（1 万次）', ok);

  const freq = {};
  for (let i = 0; i < 216000; i++) { const k = SB.rollDice(rng).total; freq[k] = (freq[k] || 0) + 1; }
  /* 216 种组合精确枚举 */
  const exact = {};
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) {
    const tt = a + b + c; exact[tt] = (exact[tt] || 0) + 1;
  }
  let maxDev = 0;
  for (let tt = 3; tt <= 18; tt++) maxDev = Math.max(maxDev, Math.abs(freq[tt] / 216000 - exact[tt] / 216));
  t('点数分布 ≈ 216 组合枚举（21.6 万次，最大偏差 <0.002）', maxDev < 0.002, maxDev.toFixed(4));
}

section('骰宝：结算数学');
{
  const mk = (id, stake) => ({ id, stake });
  /* 大/小 + 围骰通杀 */
  const r111 = { d: [1, 1, 1], total: 3 };
  let r = SB.settle([mk('big', 100), mk('small', 100)], r111);
  t('围骰 111：大小全灭', r.net === -200 && r.returned === 0, JSON.stringify(r.net));

  const r666 = { d: [6, 6, 6], total: 18 };
  r = SB.settle([mk('big', 100), mk('small', 100)], r666);
  t('围骰 666：大小全灭', r.net === -200, JSON.stringify(r.net));

  const r536 = { d: [5, 3, 6], total: 14 };
  r = SB.settle([mk('big', 100)], r536);
  t('14 大：押 100 收回 200，净 +100', r.net === 100 && r.returned === 200, JSON.stringify(r.net));
  r = SB.settle([mk('small', 100)], r536);
  t('14 小：净 -100', r.net === -100, JSON.stringify(r.net));

  /* 点数赔率：4 和 17 是 68:1 */
  r = SB.settle([mk('total:4', 10)], { d: [1, 1, 2], total: 4 });
  t('总 4：10×68 净 +680', r.net === 680 && r.returned === 690, JSON.stringify(r.net));
  r = SB.settle([mk('total:9', 10)], { d: [1, 1, 2], total: 4 });
  t('总 9 未中：净 -10', r.net === -10, JSON.stringify(r.net));

  /* 单骰：出现 1/2/3 次 1:1/2:1/12:1，取最高 */
  r = SB.settle([mk('single:6', 10)], { d: [6, 2, 3], total: 11 });
  t('单骰出现 1 次：净 +10', r.net === 10, JSON.stringify(r.net));
  r = SB.settle([mk('single:6', 10)], { d: [6, 6, 3], total: 15 });
  t('单骰出现 2 次：净 +20', r.net === 20, JSON.stringify(r.net));
  r = SB.settle([mk('single:6', 10)], { d: [6, 6, 6], total: 18 });
  t('单骰出现 3 次：净 +120', r.net === 120, JSON.stringify(r.net));

  /* 对子：非围骰两同点 13:1 */
  r = SB.settle([mk('pair:3', 10)], { d: [3, 3, 5], total: 11 });
  t('对 3（3,3,5）：净 +130', r.net === 130, JSON.stringify(r.net));
  r = SB.settle([mk('pair:3', 10)], { d: [3, 3, 3], total: 9 });
  t('对 3 遇围骰：不赔（围骰另押）', r.net === -10, JSON.stringify(r.net));

  /* 围骰 206:1 */
  r = SB.settle([mk('triple:3', 10)], { d: [3, 3, 3], total: 9 });
  t('围 3：10×206 净 +2060', r.net === 2060, JSON.stringify(r.net));
  r = SB.settle([mk('triple:3', 10)], { d: [3, 3, 5], total: 11 });
  t('围 3 未中：净 -10', r.net === -10, JSON.stringify(r.net));

  /* 组合 6:1 */
  r = SB.settle([mk('combo:2:5', 10)], { d: [2, 5, 5], total: 12 });
  t('组合 2+5：净 +60', r.net === 60, JSON.stringify(r.net));
  r = SB.settle([mk('combo:2:5', 10)], { d: [2, 3, 5], total: 10 });
  t('组合 2+5（各 1 个）：净 +60', r.net === 60, JSON.stringify(r.net));
  r = SB.settle([mk('combo:2:5', 10)], { d: [2, 2, 2], total: 6 });
  t('组合 2+5 缺 5：净 -10', r.net === -10, JSON.stringify(r.net));

  /* 多注明细 */
  r = SB.settle([mk('big', 50), mk('total:14', 10), mk('single:5', 10)], { d: [5, 3, 6], total: 14 });
  t('多注明细 3 条', r.details.length === 3 && r.staked === 70, JSON.stringify(r.details.length));
  t('多注净额 = 明细之和', r.net === r.details.reduce((s, x) => s + x.paid - x.stake, 0), JSON.stringify(r.net));
}

section('骰宝：216 组合精确枚举（庄家优势，无随机误差）');
{
  /* 对 216 种组合逐一结算，每注 10，验证赔率表自洽（比蒙特卡洛更硬） */
  function exactEV(id) {
    let sum = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) {
      sum += SB.settle([{ id, stake: 10 }], { d: [a, b, c], total: a + b + c }).net;
    }
    return sum / 216;
  }
  t('押大 精确 EV = -0.2778（-2.78%）', Math.abs(exactEV('big') + 0.27778) < 5e-5, exactEV('big').toFixed(5));
  t('押小 精确 EV = -0.2778', Math.abs(exactEV('small') + 0.27778) < 5e-5, exactEV('small').toFixed(5));
  t('押对 3 精确 EV = -0.2778（13:1）', Math.abs(exactEV('pair:3') + 0.27778) < 5e-5, exactEV('pair:3').toFixed(5));
  t('押围 3 精确 EV = -0.4167（206:1，-4.17%）', Math.abs(exactEV('triple:3') + 0.41667) < 5e-5, exactEV('triple:3').toFixed(5));
  t('押单 3 精确 EV = -0.3704（12:1 三次档）', Math.abs(exactEV('single:3') + 0.37037) < 5e-5, exactEV('single:3').toFixed(5));
  t('押组合 2+3 精确 EV = -0.2778（6:1）', Math.abs(exactEV('combo:2:3') + 0.27778) < 5e-5, exactEV('combo:2:3').toFixed(5));
  t('押总 9 精确 EV = -0.1620（7.5:1）', Math.abs(exactEV('total:9') + 0.16204) < 5e-5, exactEV('total:9').toFixed(5));
  t('押总 10 精确 EV = -0.3125（6.75:1）', Math.abs(exactEV('total:10') + 0.3125) < 5e-5, exactEV('total:10').toFixed(5));
  t('押总 4 精确 EV = -0.4167（68:1）', Math.abs(exactEV('total:4') + 0.41667) < 5e-5, exactEV('total:4').toFixed(5));
  /* 全部注型扫一遍：无正 EV（赌场不倒贴） */
  let anyPositive = false;
  SB.AREAS.forEach(a => { if (exactEV(a.id) > 0) anyPositive = true; });
  t('全部注型无正 EV（赌场不倒贴）', !anyPositive);
}

section('骰宝：展示赔率与结算常量一致（防标签漂移）');
{
  /* 每个注区扫 216 组合，收集实际命中倍数集合，与 note 里展示的 X:1 集合比对。
     曾因赔率表重调后 AREAS 标签没跟着改（桌面 5:1/150:1，内核 13:1/206:1）漏网，
     故立此断言：展示即结算，二者永远相等。 */
  function noteMults(note) {
    return new Set([...note.matchAll(/(\d+(?:\.\d+)?):1/g)].map(x => parseFloat(x[1])));
  }
  const bad = [];
  SB.AREAS.forEach(a => {
    const shown = noteMults(a.note);
    const actual = new Set();
    for (let x = 1; x <= 6; x++) for (let y = 1; y <= 6; y++) for (let z = 1; z <= 6; z++) {
      const r = SB.evalBet(a.id, { d: [x, y, z], total: x + y + z });
      if (r.hit && r.mult > 0) actual.add(r.mult);
    }
    const same = shown.size === actual.size && [...shown].every(v => actual.has(v));
    if (!same) bad.push(a.id + ' 展示[' + [...shown] + '] 实际[' + [...actual] + ']');
  });
  t('全部注区展示赔率 = 结算倍数（无漂移）', bad.length === 0, bad.join(' | '));
  t('大小注文案含围骰通杀', SB.areaOf('big').note.includes('围骰通杀') && SB.areaOf('small').note.includes('围骰通杀'));
}

section('骰宝：蒙特卡洛庄家优势');
{
  const rng = mulberry32(20261023);
  const N = 216000;   /* 216 的整数倍，对齐组合空间 */
  function evOf(id) {
    let staked = 0, returned = 0;
    for (let i = 0; i < N; i++) {
      const r = SB.rollDice(rng);
      const s = SB.settle([{ id, stake: 10 }], r);
      staked += 10; returned += s.returned;
    }
    return returned / staked - 1;
  }
  const evBig = evOf('big');
  t('押大 EV ≈ -2.78%', Math.abs(evBig + 0.027778) < 0.008, evBig.toFixed(5));
  const evSmall = evOf('small');
  t('押小 EV ≈ -2.78%', Math.abs(evSmall + 0.027778) < 0.008, evSmall.toFixed(5));
  /* 206:1 使 EV 波动被频率放大 207 倍（σ≈3%），EV 主证走精确枚举；
     蒙特卡洛这里验证中奖频率本身（σ≈0.05%） */
  const rng2 = mulberry32(20261023);
  let tripleHits = 0;
  for (let i = 0; i < N; i++) {
    const r = SB.rollDice(rng2);
    if (r.d[0] === 3 && r.d[1] === 3 && r.d[2] === 3) tripleHits++;
  }
  t('围 3 中奖频率 ≈ 1/216（±0.001）', Math.abs(tripleHits / N - 1 / 216) < 0.001, (tripleHits / N).toFixed(5));
  const evPair = evOf('pair:3');
  t('押对 3 EV ≈ -2.78%', Math.abs(evPair + 0.027778) < 0.008, evPair.toFixed(5));
  const evSingle = evOf('single:3');
  t('押单 3 EV ≈ -3.70%', Math.abs(evSingle + 0.037037) < 0.008, evSingle.toFixed(5));
  const evCombo = evOf('combo:2:3');
  t('押组合 2+3 EV ≈ -2.78%', Math.abs(evCombo + 0.027778) < 0.008, evCombo.toFixed(5));
}

/* ================= 百家乐 ================= */
section('百家乐：牌值与点数');
{
  t('cardValue：A=1，10/J/Q/K=0', BC.cardValue('A') === 1 && BC.cardValue('10') === 0
    && BC.cardValue('J') === 0 && BC.cardValue('Q') === 0 && BC.cardValue('K') === 0 && BC.cardValue('7') === 7);
  t('total 取个位数', BC.total(fixedShoe(['9', '7'])) === 6 && BC.total(fixedShoe(['K', '9', '5'])) === 4);
  t('例牌判定 8/9', BC.isNatural(8) && BC.isNatural(9) && !BC.isNatural(7) && !BC.isNatural(0));
}

section('百家乐：补牌规则（标准表逐格）');
{
  t('闲家 0-5 补 / 6-7 停', BC.playerDraws(0) && BC.playerDraws(5) && !BC.playerDraws(6) && !BC.playerDraws(7));
  t('闲未补：庄 0-5 补 / 6-7 停', BC.bankerDraws(3, null) && BC.bankerDraws(5, null) && !BC.bankerDraws(6, null) && !BC.bankerDraws(7, null));
  const cv = v => ({ rank: v, suit: '♠', value: BC.cardValue(v) });
  t('庄 3：闲三=8 停，否则补', !BC.bankerDraws(3, cv('8')) && BC.bankerDraws(3, cv('7')));
  t('庄 4：闲三∈{0,1,8,9} 停', !BC.bankerDraws(4, cv('10')) && !BC.bankerDraws(4, cv('A'))
    && !BC.bankerDraws(4, cv('8')) && !BC.bankerDraws(4, cv('9')) && BC.bankerDraws(4, cv('5')));
  t('庄 5：闲三∈{4,5,6,7} 补（标准表，易记反）', BC.bankerDraws(5, cv('6')) && BC.bankerDraws(5, cv('4'))
    && !BC.bankerDraws(5, cv('3')) && !BC.bankerDraws(5, cv('8')));
  t('庄 6：闲三∈{6,7} 补', BC.bankerDraws(6, cv('6')) && BC.bankerDraws(6, cv('7')) && !BC.bankerDraws(6, cv('5')));
  t('庄 7 恒停', !BC.bankerDraws(7, cv('6')) && !BC.bankerDraws(7, null));
}

section('百家乐：发牌流程（固定牌堆）');
{
  /* 例牌：闲 [9,9]=8 天牌 vs 庄 [8,8]=6，不补牌。
   * dealRound 里 player 连抽两张：p1,p2,b1,b2 = 9,9,8,8 → shoe=[b2,b1,p2,p1]=[8,8,9,9] */
  let shoe = fixedShoe(['8', '8', '9', '9']);
  let r = BC.dealRound(shoe, function () { return 0; });
  t('例牌 8v6：natural、不补第三张', r.natural && r.pTotal === 8 && r.bTotal === 6
    && r.player.length === 2 && r.banker.length === 2 && r.outcome === 'player');

  /* 和局：闲 [4,5]=9 vs 庄 [4,5]=9。p1,p2,b1,b2 = 4,5,4,5 → shoe=[5,4,5,4] */
  shoe = fixedShoe(['5', '4', '5', '4']);
  r = BC.dealRound(shoe, function () { return 0; });
  t('9v9 和局：natural、不补牌', r.outcome === 'tie' && r.pTotal === 9 && r.bTotal === 9 && r.natural);

  /* 补牌流程可跑完且三张上限（长 shoe 走真实重洗前的 draw） */
  shoe = BC.newShoe(mulberry32(7));
  shoe.fixed = false;
  for (let i = 0; i < 200; i++) {
    r = BC.dealRound(shoe, mulberry32(100 + i));
    if (r.player.length > 3 || r.banker.length > 3) { t('补牌流程三张上限', false); break; }
    if (i === 199) t('补牌流程 200 局无越界', true);
  }
}

section('百家乐：结算数学');
{
  t('押闲中：净 +100', BC.settleBet('player', 'player', 100).net === 100);
  t('押庄中：净 +95（抽 5% 佣）', BC.settleBet('banker', 'banker', 100).net === 95);
  t('押和中：净 +800', BC.settleBet('tie', 'tie', 100).net === 800);
  t('押庄负：净 -100', BC.settleBet('banker', 'player', 100).net === -100);
  t('和局退庄闲注：净 0', BC.settleBet('banker', 'tie', 100).net === 0 && BC.settleBet('player', 'tie', 100).net === 0);
  const m = BC.settleBets([{ bet: 'banker', stake: 100 }, { bet: 'tie', stake: 10 }], 'banker');
  t('多注：庄和局各算各的', m.net === 95 - 10, JSON.stringify(m.net));
}

section('百家乐：蒙特卡洛庄家优势');
{
  const rng = mulberry32(424242);
  const N = 200000;
  let shoe = BC.newShoe(rng);
  let wager = { player: 0, banker: 0, tie: 0 }, ret = { player: 0, banker: 0, tie: 0 };
  let cnt = { player: 0, banker: 0, tie: 0 };
  for (let i = 0; i < N; i++) {
    const r = BC.dealRound(shoe, rng);
    cnt[r.outcome]++;
    ['player', 'banker', 'tie'].forEach(b => {
      const s = BC.settleBet(b, r.outcome, 10);
      wager[b] += 10; ret[b] += 10 + s.net;
    });
  }
  const evB = ret.banker / wager.banker - 1, evP = ret.player / wager.player - 1, evT = ret.tie / wager.tie - 1;
  t('押庄 EV ≈ -1.06%', Math.abs(evB + 0.010579) < 0.004, evB.toFixed(5));
  t('押闲 EV ≈ -1.24%', Math.abs(evP + 0.012351) < 0.004, evP.toFixed(5));
  t('押和 EV ≈ -14.36%', Math.abs(evT + 0.143596) < 0.01, evT.toFixed(5));
  t('庄胜率 ≈45.86% / 闲 ≈44.62% / 和 ≈9.52%',
    Math.abs(cnt.banker / N - 0.458597) < 0.004 && Math.abs(cnt.player / N - 0.446246) < 0.004
    && Math.abs(cnt.tie / N - 0.095156) < 0.004,
    (cnt.banker / N).toFixed(4) + '/' + (cnt.player / N).toFixed(4) + '/' + (cnt.tie / N).toFixed(4));
  t('靴自动重洗不越界', shoe.length >= BC.DECKS * 52 - 6 * 52 - 12, shoe.length);
}

console.log('\n========================================');
console.log('骰宝+百家乐内核测试：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('========================================');
process.exit(fail ? 1 : 0);
